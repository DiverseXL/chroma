import type { RetryingPrismaClient } from "@chroma/db";
import { EventBus } from "../events/bus.js";
import { getExecutor } from "../executors/index.js";
import type { ProviderSet } from "../executors/types.js";
import type { CompiledGraph } from "../graph/compiler.js";
import type { ProviderAdapter } from "../provider/adapter.js";
import {
  ProviderContentFilterError,
  ProviderRateLimitError,
} from "../provider/adapter.js";
import { writeArtifact } from "../storage/local.js";
import type {
  Artifact,
  EdgeSpec,
  NodeKind,
  NodeSpec,
  NodeStatus,
  RunStatus,
} from "../types/index.js";

/**
 * Result returned upon completion of a workflow run execution.
 */
export interface RunResult {
  runId: string;
  status: RunStatus;
  error?: string;
}

/**
 * Configuration options for the Scheduler.
 *
 * Pass either `providers` (capability-keyed set) or the legacy `adapter`
 * (single adapter mirrored into all three capability slots). When both are
 * present, `providers` takes precedence.
 */
export interface SchedulerOptions {
  /**
   * Capability-keyed provider adapters (preferred over the legacy `adapter` field).
   */
  providers?: ProviderSet;
  /**
   * Legacy single-adapter shortcut retained for Step 2 tests.
   * When supplied without `providers`, the adapter is mirrored into all three
   * capability slots.
   */
  adapter?: ProviderAdapter;
  eventBus: EventBus;
  db: RetryingPrismaClient;
  concurrency?: number;
  critiqueThreshold?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

interface ReadyQueueItem {
  nodeId: string;
  rank: number;
  seq: number;
}

/**
 * Returns the maximum allowed retry attempts for a given NodeKind.
 *
 * @param kind The kind of node.
 * @returns Maximum attempts count.
 */
export function getMaxAttemptsForKind(kind: NodeKind): number {
  switch (kind) {
    case "IMAGE_GENERATE":
    case "IMAGE_EDIT":
      return 3;
    case "PLAN":
    case "PROMPT_COMPILE":
    case "CRITIQUE":
    case "CONSISTENCY_CHECK":
      return 2;
    case "STYLE_ANALYSIS":
    case "GATE":
    case "COMPOSE":
      return 1;
    default:
      return 1;
  }
}

/**
 * Computes backoff duration in milliseconds according to retry count and error type.
 *
 * @param kind The kind of node.
 * @param attempt 1-indexed attempt number that failed.
 * @param isRateLimit Whether the error was a rate limit.
 * @returns Delay in milliseconds before next attempt.
 */
export function calculateBackoffMs(
  _kind: NodeKind,
  attempt: number,
  isRateLimit: boolean,
): number {
  const base = isRateLimit ? 5000 : 1000;
  return base * Math.pow(2, attempt - 1);
}

/**
 * Topological scheduler that executes a compiled graph with concurrency controls, retries, and dynamic regeneration.
 */
export class Scheduler {
  private readonly providers: ProviderSet;
  private readonly eventBus: EventBus;
  private readonly db: RetryingPrismaClient;
  private readonly concurrency: number;
  private readonly critiqueThreshold: number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  /**
   * Initializes a new Scheduler instance.
   * @param opts Scheduler configuration and dependencies.
   */
  constructor(opts: SchedulerOptions) {
    // Build the providers set. When an explicit providers object is given it
    // wins; otherwise the legacy adapter is mirrored into all three slots so
    // Step 2 tests that pass a single MockAdapter continue to work unchanged.
    if (opts.providers) {
      this.providers = opts.providers;
    } else if (opts.adapter) {
      this.providers = {
        image: opts.adapter,
        vision: opts.adapter,
        text: opts.adapter,
      };
    } else {
      throw new Error(
        "Scheduler: supply either providers or adapter in SchedulerOptions",
      );
    }
    this.eventBus = opts.eventBus;
    this.db = opts.db;
    this.concurrency = opts.concurrency ?? 4;
    this.critiqueThreshold = opts.critiqueThreshold ?? 0.7;
    this.sleepFn =
      opts.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Executes a compiled workflow graph for a given run ID to completion.
   *
   * @param runId Target run identifier.
   * @param graph The compiled and validated DAG.
   * @returns Final run execution result and status.
   */
  async run(runId: string, graph: CompiledGraph): Promise<RunResult> {
    const nodeStatusMap = new Map<string, NodeStatus>();
    const nodeOutputs = new Map<string, unknown>();
    const inDegree = new Map<string, number>();
    const regenerationCounts = new Map<string, number>();

    const readyQueue: ReadyQueueItem[] = [];
    let sequenceCounter = 0;

    // Initialize node statuses and in-degree counts
    for (const node of graph.nodes) {
      const deg = graph.fanIn.get(node.id)?.length ?? 0;
      inDegree.set(node.id, deg);

      if (deg === 0) {
        nodeStatusMap.set(node.id, "READY");
        readyQueue.push({
          nodeId: node.id,
          rank: graph.rank.get(node.id) ?? 0,
          seq: ++sequenceCounter,
        });
      } else {
        nodeStatusMap.set(node.id, "PENDING");
      }
    }

    // Update Run status to RUNNING in database and emit initial status
    await this.db.run.update({
      where: { id: runId },
      data: { status: "RUNNING" },
    });

    let terminalFailure = false;
    let failureError: string | undefined;
    let activeWorkers = 0;

    // Helper to cascade SKIPPED status down the fanOut graph from failed nodes
    const skipDownstream = async (startNodeId: string) => {
      const skipQueue = [...(graph.fanOut.get(startNodeId) ?? [])];
      while (skipQueue.length > 0) {
        const nextId = skipQueue.shift()!;
        const currentStatus = nodeStatusMap.get(nextId);
        if (currentStatus === "PENDING" || currentStatus === "READY") {
          nodeStatusMap.set(nextId, "SKIPPED");
          await this.db.node.update({
            where: { id: nextId },
            data: { status: "SKIPPED", endedAt: new Date() },
          });
          await this.eventBus.publish(runId, {
            type: "node.status",
            nodeId: nextId,
            payload: { status: "SKIPPED" },
          });
          for (const downstream of graph.fanOut.get(nextId) ?? []) {
            skipQueue.push(downstream);
          }
        }
      }
    };

    // Helper to sort ready queue by (rank ASC, insertion sequence ASC)
    const sortQueue = () => {
      readyQueue.sort((a, b) => {
        if (a.rank !== b.rank) {
          return a.rank - b.rank;
        }
        return a.seq - b.seq;
      });
    };

    // Main scheduling loop
    return new Promise<RunResult>((resolve, reject) => {
      const step = async () => {
        // If terminal failure occurred and no workers remain active, finalize run
        if (terminalFailure && activeWorkers === 0) {
          await this.db.run.update({
            where: { id: runId },
            data: { status: "FAILED", completedAt: new Date() },
          });
          await this.eventBus.publish(runId, {
            type: "run.completed",
            payload: { status: "FAILED", error: failureError },
          });
          return resolve({ runId, status: "FAILED", error: failureError });
        }

        // Check completion: all nodes reached terminal states
        const allCompleted = graph.nodes.every((n) => {
          const s = nodeStatusMap.get(n.id);
          return (
            s === "SUCCEEDED" ||
            s === "FAILED" ||
            s === "SKIPPED"
          );
        });

        if (allCompleted && activeWorkers === 0) {
          const finalStatus: RunStatus = terminalFailure
            ? "FAILED"
            : "SUCCEEDED";

          await this.db.run.update({
            where: { id: runId },
            data: { status: finalStatus, completedAt: new Date() },
          });
          await this.eventBus.publish(runId, {
            type: "run.completed",
            payload: { status: finalStatus },
          });
          return resolve({ runId, status: finalStatus });
        }

        // Dispatch ready tasks up to concurrency capacity
        while (
          activeWorkers < this.concurrency &&
          readyQueue.length > 0 &&
          !terminalFailure
        ) {
          sortQueue();
          const item = readyQueue.shift()!;
          const node = graph.nodes.find((n) => n.id === item.nodeId);
          if (!node) {
            continue;
          }

          const currentStatus = nodeStatusMap.get(node.id);
          if (currentStatus === "SKIPPED" || currentStatus === "FAILED") {
            continue;
          }

          activeWorkers++;
          this.executeNode(
            runId,
            node,
            graph,
            nodeOutputs,
            regenerationCounts,
          )
            .then(async (result) => {
              activeWorkers--;

              if (result.success) {
                if (result.regeneratedNodeId) {
                  // Critique triggered a regeneration: pause critique into PENDING until new image finishes
                  nodeStatusMap.set(node.id, "PENDING");
                  inDegree.set(node.id, 1);

                  // Enqueue fresh node into ready queue
                  readyQueue.push({
                    nodeId: result.regeneratedNodeId,
                    rank: graph.rank.get(result.regeneratedNodeId) ?? 0,
                    seq: ++sequenceCounter,
                  });
                } else {
                  nodeStatusMap.set(node.id, "SUCCEEDED");
                  nodeOutputs.set(node.id, result.output);

                  // Notify downstream neighbors
                  for (const downstreamId of graph.fanOut.get(node.id) ?? []) {
                    const remaining = (inDegree.get(downstreamId) ?? 1) - 1;
                    inDegree.set(downstreamId, remaining);

                    if (remaining === 0) {
                      nodeStatusMap.set(downstreamId, "READY");
                      readyQueue.push({
                        nodeId: downstreamId,
                        rank: graph.rank.get(downstreamId) ?? 0,
                        seq: ++sequenceCounter,
                      });
                    }
                  }
                }
              } else {
                // Node failed terminally
                nodeStatusMap.set(node.id, "FAILED");
                terminalFailure = true;
                failureError = result.error;
                await skipDownstream(node.id);
              }

              step().catch(reject);
            })
            .catch((err) => {
              activeWorkers--;
              terminalFailure = true;
              failureError = err instanceof Error ? err.message : String(err);
              step().catch(reject);
            });
        }
      };

      step().catch(reject);
    });
  }

  /**
   * Executes a single node with retry logic, backoff, and artifact tracking.
   */
  private async executeNode(
    runId: string,
    node: NodeSpec,
    graph: CompiledGraph,
    nodeOutputs: Map<string, unknown>,
    regenerationCounts: Map<string, number>,
  ): Promise<{
    success: boolean;
    output?: unknown;
    error?: string;
    regeneratedNodeId?: string;
  }> {
    const maxAttempts = getMaxAttemptsForKind(node.kind);
    let attempts = 0;

    await this.eventBus.publish(runId, {
      type: "node.status",
      nodeId: node.id,
      payload: { status: "RUNNING" },
    });

    await this.db.node.update({
      where: { id: node.id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        maxAttempts,
      },
    });

    await this.eventBus.publish(runId, {
      type: "node.started",
      nodeId: node.id,
      payload: { maxAttempts },
    });

    // Resolve node input payload from inbound dependencies
    const inputPayload: Record<string, unknown> = {};
    for (const [port, ref] of Object.entries(node.inputs)) {
      const [srcNodeId, srcPort] = ref.split(".");
      const srcOutput = nodeOutputs.get(srcNodeId);
      if (
        typeof srcOutput === "object" &&
        srcOutput !== null &&
        srcPort &&
        srcPort in srcOutput
      ) {
        inputPayload[port] = (srcOutput as Record<string, unknown>)[srcPort];
      } else {
        inputPayload[port] = srcOutput;
      }
    }

    const executor = getExecutor(node.kind);

    while (attempts < maxAttempts) {
      attempts++;
      await this.db.node.update({
        where: { id: node.id },
        data: { attempts },
      });

      try {
        const artifactsWritten: Artifact[] = [];

        const ctx = {
          providers: this.providers,
          // Retained for backward compatibility: mirrors the image adapter.
          adapter: this.providers.image,
          db: this.db,
          runId,
          nodeId: node.id,
          artifacts: {
            write: async (
              bytes: Uint8Array,
              mimeType: string,
              width?: number,
              height?: number,
              metadata?: Record<string, unknown>,
            ) => {
              const art = await writeArtifact(
                this.db,
                node.id,
                bytes,
                mimeType,
                width,
                height,
                metadata,
              );
              artifactsWritten.push(art);
              await this.eventBus.publish(runId, {
                type: "node.artifact",
                nodeId: node.id,
                payload: { artifactId: art.id, mimeType, kind: art.kind },
              });
              return art;
            },
          },
        };

        const output = await executor(inputPayload, ctx);

        // Check if critique triggered a regeneration
        let regeneratedNodeId: string | undefined;
        if (node.kind === "CRITIQUE") {
          const critiqueResult = output as {
            score?: number;
            issues?: string[];
          };
          if (
            typeof critiqueResult.score === "number" &&
            critiqueResult.score < this.critiqueThreshold
          ) {
            // Find target image node to regenerate
            const parentNodeId = graph.fanIn.get(node.id)?.[0];
            const targetNodeId =
              parentNodeId &&
              graph.nodes.find((n) => n.id === parentNodeId)?.kind ===
                "IMAGE_GENERATE"
                ? parentNodeId
                : graph.nodes.find((n) => n.kind === "IMAGE_GENERATE")?.id;

            if (targetNodeId) {
              const currentRegenCount =
                regenerationCounts.get(targetNodeId) ?? 0;
              if (currentRegenCount < 2) {
                const newCount = currentRegenCount + 1;
                regenerationCounts.set(targetNodeId, newCount);

                await this.db.node.update({
                  where: { id: node.id },
                  data: { status: "REGENERATING" },
                });

                await this.eventBus.publish(runId, {
                  type: "node.regenerating",
                  nodeId: node.id,
                  payload: {
                    targetNodeId,
                    regenerationCount: newCount,
                    issues: critiqueResult.issues ?? [],
                  },
                });

                // Insert a fresh IMAGE_GENERATE node
                const targetNode = graph.nodes.find(
                  (n) => n.id === targetNodeId,
                )!;
                const freshNodeId = `${targetNodeId}-regen-${newCount}`;
                const freshNodeSpec: NodeSpec = {
                  id: freshNodeId,
                  kind: "IMAGE_GENERATE",
                  label: `${targetNode.label} (Regeneration ${newCount})`,
                  inputs: { ...targetNode.inputs },
                  outputs: [...targetNode.outputs],
                };

                const freshInputJson = {
                  ...((targetNode.inputs as object) ?? {}),
                  avoid: critiqueResult.issues ?? [],
                };

                // Persist new node to database
                await this.db.node.create({
                  data: {
                    id: freshNodeId,
                    runId,
                    kind: "IMAGE_GENERATE",
                    status: "READY",
                    label: freshNodeSpec.label,
                    inputJson: freshInputJson,
                    attempts: 0,
                    maxAttempts: getMaxAttemptsForKind("IMAGE_GENERATE"),
                  },
                });

                // Mutate graph runtime structures
                graph.nodes.push(freshNodeSpec);
                graph.fanIn.set(freshNodeId, [
                  ...(graph.fanIn.get(targetNodeId) ?? []),
                ]);
                graph.fanOut.set(freshNodeId, [node.id]);

                // Recompute rank for the new node only
                const maxParentRank = Math.max(
                  0,
                  ...(graph.fanIn
                    .get(freshNodeId)!
                    .map((p) => graph.rank.get(p) ?? 0)),
                );
                graph.rank.set(freshNodeId, maxParentRank + 1);

                // Add edges from upstream to freshNode
                for (const edge of graph.edges.filter(
                  (e) => e.to === targetNodeId,
                )) {
                  const freshEdge: EdgeSpec = {
                    from: edge.from,
                    to: freshNodeId,
                    fromPort: edge.fromPort,
                    toPort: edge.toPort,
                  };
                  graph.edges.push(freshEdge);
                  await this.db.edge.create({
                    data: {
                      runId,
                      fromNodeId: edge.from,
                      toNodeId: freshNodeId,
                      fromPort: edge.fromPort,
                      toPort: edge.toPort,
                    },
                  });
                }

                // Add edge from freshNode to critique node so critique re-evaluates
                const critiqueEdge: EdgeSpec = {
                  from: freshNodeId,
                  to: node.id,
                  fromPort: "out",
                  toPort: "in",
                };
                graph.edges.push(critiqueEdge);
                await this.db.edge.create({
                  data: {
                    runId,
                    fromNodeId: freshNodeId,
                    toNodeId: node.id,
                    fromPort: "out",
                    toPort: "in",
                  },
                });

                graph.fanIn.get(node.id)?.push(freshNodeId);

                regeneratedNodeId = freshNodeId;
              }
            }
          }
        }

        // Persist SUCCEEDED status and outputJson
        if (!regeneratedNodeId) {
          await this.db.node.update({
            where: { id: node.id },
            data: {
              status: "SUCCEEDED",
              endedAt: new Date(),
              outputJson: (output ?? {}) as object,
            },
          });

          await this.eventBus.publish(runId, {
            type: "node.status",
            nodeId: node.id,
            payload: { status: "SUCCEEDED" },
          });
        }

        return {
          success: true,
          output,
          regeneratedNodeId,
        };
      } catch (error) {
        const isRateLimit = error instanceof ProviderRateLimitError;
        // Content-filter rejections are deterministic: the identical prompt
        // would be rejected again, so this failure is terminal on first sight.
        const isNonRetryable = error instanceof ProviderContentFilterError;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (!isNonRetryable && attempts < maxAttempts) {
          const backoffDelay = calculateBackoffMs(
            node.kind,
            attempts,
            isRateLimit,
          );
          await this.sleepFn(backoffDelay);
        } else {
          // Terminal failure for this node
          await this.db.node.update({
            where: { id: node.id },
            data: {
              status: "FAILED",
              endedAt: new Date(),
            },
          });

          await this.eventBus.publish(runId, {
            type: "node.failed",
            nodeId: node.id,
            payload: { error: errorMessage, attempts },
          });

          await this.eventBus.publish(runId, {
            type: "node.status",
            nodeId: node.id,
            payload: { status: "FAILED" },
          });

          return {
            success: false,
            error: errorMessage,
          };
        }
      }
    }

    return {
      success: false,
      error: `Exceeded max attempts (${maxAttempts})`,
    };
  }
}
