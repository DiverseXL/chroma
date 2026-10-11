import {
  compileGraph,
  executePlan,
  getMaxAttemptsForKind,
  writeArtifact,
  type CompiledGraph,
} from "@chroma/core";
import { prisma } from "@chroma/db";
import { after, NextResponse } from "next/server";
import { eventBus, providers, scheduler } from "@/lib/engine";

// Vercel grants the full 60s Hobby-plan function timeout only when the route
// opts in explicitly. See the after() call in POST below.
export const maxDuration = 60;

// Prisma and the SSE streaming route both require the Node.js runtime.
export const runtime = "nodejs";

/**
 * In-memory rate limiter for run creation, protecting provider spend
 * (Cloudflare/KIE credits) and keeping demo instances abuse-resistant.
 *
 * Limits: 3 runs per IP per 30 minutes, 25 runs globally per 24 hours.
 *
 * NOTE: the buckets live in this module's memory, so a serverless cold start
 * or dev-server restart resets every counter. That is acceptable for local
 * demos but must move to a durable store (Redis/DB) before production deploy.
 */
const IP_RUN_LIMIT = 3;
const IP_WINDOW_MS = 30 * 60 * 1000;
const GLOBAL_RUN_LIMIT = 25;
const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;

interface RateBucket {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, RateBucket>();
let globalBucket: RateBucket = {
  count: 0,
  resetAt: Date.now() + GLOBAL_WINDOW_MS,
};

/**
 * Checks and consumes one run slot for the given client.
 *
 * @param ip Client IP key.
 * @param now Current epoch milliseconds.
 * @returns null when a slot was consumed, otherwise the seconds to wait.
 */
function consumeRunSlot(ip: string, now: number): number | null {
  if (now >= globalBucket.resetAt) {
    globalBucket = { count: 0, resetAt: now + GLOBAL_WINDOW_MS };
  }

  let bucket = ipBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + IP_WINDOW_MS };
    ipBuckets.set(ip, bucket);
  }

  // Opportunistic cleanup so long-running processes do not grow unbounded.
  if (ipBuckets.size > 128) {
    for (const [key, entry] of ipBuckets) {
      if (now >= entry.resetAt) ipBuckets.delete(key);
    }
  }

  if (bucket.count >= IP_RUN_LIMIT) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }
  if (globalBucket.count >= GLOBAL_RUN_LIMIT) {
    return Math.max(1, Math.ceil((globalBucket.resetAt - now) / 1000));
  }

  bucket.count += 1;
  globalBucket.count += 1;
  return null;
}

export async function GET(): Promise<NextResponse> {
  const runs = await prisma.run.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      brief: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ runs });
}

/**
 * Handles creation of a new generation workflow run.
 * Scaffolds the database records, compiles the storyboard DAG, and launches scheduling asynchronously.
 *
 * @param req HTTP request containing the user's brief.
 * @returns JSON response with the generated runId.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const retryAfterSeconds = consumeRunSlot(ip, Date.now());
  if (retryAfterSeconds !== null) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Rate limit reached: ${IP_RUN_LIMIT} runs per IP per 30 minutes and ${GLOBAL_RUN_LIMIT} runs per day. Retry in ${retryAfterSeconds}s.`,
        retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { brief?: string };
  const brief = typeof body?.brief === "string" ? body.brief : "Storyboard";

  // Create Run record in database
  const run = await prisma.run.create({
    data: {
      brief,
      status: "PENDING",
      degraded: false,
    },
  });

  // Node.id is the global Prisma primary key, but the planner emits
  // deterministic local ids ("plan-0", "panel1_prompt", ...). Scope every local
  // id to this run so a second run cannot collide with rows from the first.
  //
  // Declared before planCtx: the planner context references node ids too, but
  // can only resolve them lazily because the graph does not exist until after
  // executePlan() returns.
  const idMap = new Map<string, string>();

  // Call plan executor
  const planCtx = {
    providers,
    adapter: providers.image,
    db: prisma,
    runId: run.id,
    get nodeId(): string {
      return idMap.get("plan-0") ?? `${run.id}:plan-0`;
    },
    artifacts: {
      write: (
        bytes: Uint8Array,
        mimeType: string,
        width?: number,
        height?: number,
        metadata?: Record<string, unknown>,
      ) =>
        writeArtifact(
          prisma,
          idMap.get("plan-0") ?? `${run.id}:plan-0`,
          bytes,
          mimeType,
          width,
          height,
          metadata,
        ),
    },
  };

  const graphSpec = await executePlan(brief, planCtx);

  // Compile and validate the DAG
  const compiled = compileGraph(graphSpec);

  for (const n of compiled.nodes) {
    idMap.set(n.id, `${run.id}:${n.id}`);
  }

  // Rewrites a planner input reference of the form "<srcLocalId>.<port>" onto
  // the scoped id. Ports are left untouched.
  const remapRef = (ref: string): string => {
    const dot = ref.indexOf(".");
    if (dot === -1) return idMap.get(ref) ?? ref;
    const src = ref.slice(0, dot);
    const port = ref.slice(dot);
    return `${idMap.get(src) ?? src}${port}`;
  };

  // Persist Node records in database
  for (const node of compiled.nodes) {
    await prisma.node.create({
      data: {
        id: idMap.get(node.id) as string,
        runId: run.id,
        kind: node.kind,
        status: "PENDING",
        label: node.label,
        // Keep the planner's local id reachable without a schema migration.
        inputJson: {
          ...((node.inputs ?? {}) as object),
          _localId: node.id,
        } as object,
        attempts: 0,
        maxAttempts: getMaxAttemptsForKind(node.kind),
      },
    });
  }

  // Persist Edge records in database
  for (const edge of compiled.edges) {
    await prisma.edge.create({
      data: {
        runId: run.id,
        fromNodeId: idMap.get(edge.from) as string,
        toNodeId: idMap.get(edge.to) as string,
        fromPort: edge.fromPort,
        toPort: edge.toPort,
      },
    });
  }

  const [persistedNodes, persistedEdges] = await Promise.all([
    prisma.node.findMany({
      where: { runId: run.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.edge.findMany({
      where: { runId: run.id },
      orderBy: { id: "asc" },
    }),
  ]);

  await eventBus.publish(run.id, {
    type: "run.created",
    payload: run,
  });
  for (const node of persistedNodes) {
    await eventBus.publish(run.id, {
      type: "node.created",
      nodeId: node.id,
      payload: node,
    });
  }
  for (const edge of persistedEdges) {
    await eventBus.publish(run.id, {
      type: "edge.created",
      payload: edge,
    });
  }

  // The scheduler reads and writes Node/Artifact rows by the ids carried on the
  // graph it is handed, so it must receive scoped ids too — including the
  // "<localId>.<port>" input references it resolves at scheduler.ts:387.
  const scheduledGraph: CompiledGraph = {
    nodes: compiled.nodes.map((n) => ({
      ...n,
      id: idMap.get(n.id) as string,
      inputs: Object.fromEntries(
        Object.entries(n.inputs ?? {}).map(([port, ref]) => [
          port,
          remapRef(ref),
        ]),
      ),
    })),
    edges: compiled.edges.map((e) => ({
      ...e,
      from: idMap.get(e.from) as string,
      to: idMap.get(e.to) as string,
    })),
    metadata: compiled.metadata,
    order: compiled.order.map((id) => idMap.get(id) as string),
    rank: new Map(
      [...compiled.rank].map(([k, v]): [string, number] => [
        idMap.get(k) as string,
        v,
      ]),
    ),
    fanIn: new Map(
      [...compiled.fanIn].map(([k, v]): [string, string[]] => [
        idMap.get(k) as string,
        v.map((x) => idMap.get(x) as string),
      ]),
    ),
    fanOut: new Map(
      [...compiled.fanOut].map(([k, v]): [string, string[]] => [
        idMap.get(k) as string,
        v.map((x) => idMap.get(x) as string),
      ]),
    ),
  };

  // Launch the scheduler after the response is flushed. Vercel kills the
  // function as soon as the response is returned, so the fire-and-forget call
  // used previously was cancelled mid-run. after() keeps the invocation alive
  // until this callback settles.
  //
  // NOTE: the Hobby plan caps function execution at 60s (see maxDuration).
  // A run that needs more time must move to a persistent host (Railway, a
  // long-lived container, or a queue + worker) instead of Vercel serverless.
  after(async () => {
    await scheduler.run(run.id, scheduledGraph).catch((err) => {
      console.error(
        `Scheduler background execution error for run ${run.id}:`,
        err,
      );
    });
  });

  return NextResponse.json({ runId: run.id });
}
