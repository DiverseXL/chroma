import { PrismaClient } from "@chroma/db";
import { describe, expect, it } from "vitest";
import { EventBus } from "../events/bus.js";
import { compileGraph } from "../graph/compiler.js";
import { MockAdapter } from "../provider/mock.js";
import type { GraphSpec } from "../types/index.js";
import { Scheduler } from "./scheduler.js";

/**
 * Creates an in-memory mock PrismaClient conforming to the calls made by Scheduler and EventBus.
 */
function createMockDb(): PrismaClient {
  const runs = new Map<string, Record<string, unknown>>();
  const nodes = new Map<string, Record<string, unknown>>();
  const edges: Array<Record<string, unknown>> = [];
  const artifacts: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const mockDb = {
    run: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const existing = runs.get(where.id) ?? { id: where.id };
        const updated = { ...existing, ...data };
        runs.set(where.id, updated);
        return updated;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        return runs.get(where.id) ?? null;
      },
    },
    node: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        nodes.set(data.id as string, { ...data });
        return data;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const existing = nodes.get(where.id) ?? { id: where.id };
        const updated = { ...existing, ...data };
        nodes.set(where.id, updated);
        return updated;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        return nodes.get(where.id) ?? null;
      },
      findMany: async () => Array.from(nodes.values()),
    },
    edge: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        edges.push(data);
        return data;
      },
      findMany: async () => edges,
    },
    artifact: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const record = { id: `art-${artifacts.length + 1}`, ...data };
        artifacts.push(record);
        return record;
      },
      // readArtifact() resolves artifacts through findUnique, so the mock must
      // expose it; the record keeps the storageKey writeArtifact() set.
      findUnique: async ({ where }: { where: { id: string } }) => {
        return artifacts.find((a) => a.id === where.id) ?? null;
      },
      findMany: async () => artifacts,
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const record = { id: `evt-${events.length + 1}`, ...data };
        events.push(record);
        return record;
      },
      aggregate: async ({ where }: { where: { runId: string } }) => {
        const runEvents = events.filter((e) => e.runId === where.runId);
        const maxSeq =
          runEvents.length === 0
            ? null
            : Math.max(...runEvents.map((e) => Number(e.sequence)));
        return { _max: { sequence: maxSeq } };
      },
      findMany: async ({ where }: { where: { runId: string } }) => {
        return events.filter((e) => e.runId === where.runId);
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb),
    $executeRaw: async () => 1,
  };

  return mockDb as unknown as PrismaClient;
}

describe("Scheduler", () => {
  it("runs a linear graph to SUCCEEDED", async () => {
    const db = createMockDb();
    const eventBus = new EventBus({ db });
    const adapter = new MockAdapter();
    const scheduler = new Scheduler({
      adapter,
      eventBus,
      db,
      sleepFn: async () => {},
    });

    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-1",
          kind: "PLAN",
          label: "Plan",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "prompt-1",
          kind: "PROMPT_COMPILE",
          label: "Prompt",
          inputs: { in: "plan-1.out" },
          outputs: ["prompt"],
        },
        {
          id: "img-1",
          kind: "IMAGE_GENERATE",
          label: "Image",
          inputs: { in: "prompt-1.prompt" },
          outputs: ["image"],
        },
      ],
      edges: [
        { from: "plan-1", to: "prompt-1", fromPort: "out", toPort: "in" },
        { from: "prompt-1", to: "img-1", fromPort: "prompt", toPort: "in" },
      ],
    };

    const graph = compileGraph(spec);
    const result = await scheduler.run("run-linear", graph);

    expect(result.status).toBe("SUCCEEDED");
  });

  it("runs fan-out graph concurrently (assert wall-clock < serial time)", async () => {
    const db = createMockDb();
    const eventBus = new EventBus({ db });
    let activeGenerations = 0;
    let maxActiveGenerations = 0;

    class DelayAdapter extends MockAdapter {
      override async generateImage(
        req: Parameters<MockAdapter["generateImage"]>[0],
      ) {
        activeGenerations++;
        maxActiveGenerations = Math.max(
          maxActiveGenerations,
          activeGenerations,
        );
        try {
          await new Promise((r) => setTimeout(r, 60));
          return await super.generateImage(req);
        } finally {
          activeGenerations--;
        }
      }
    }

    const adapter = new DelayAdapter();
    const scheduler = new Scheduler({
      adapter,
      eventBus,
      db,
      concurrency: 4,
      sleepFn: async () => {},
    });

    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-root",
          kind: "PLAN",
          label: "Root",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "branch-a",
          kind: "IMAGE_GENERATE",
          label: "Branch A",
          inputs: { in: "plan-root.out" },
          outputs: ["outA"],
        },
        {
          id: "branch-b",
          kind: "IMAGE_GENERATE",
          label: "Branch B",
          inputs: { in: "plan-root.out" },
          outputs: ["outB"],
        },
        {
          id: "branch-c",
          kind: "IMAGE_GENERATE",
          label: "Branch C",
          inputs: { in: "plan-root.out" },
          outputs: ["outC"],
        },
        {
          id: "join-node",
          kind: "COMPOSE",
          label: "Join",
          inputs: {
            a: "branch-a.outA",
            b: "branch-b.outB",
            c: "branch-c.outC",
          },
          outputs: ["final"],
        },
      ],
      edges: [
        { from: "plan-root", to: "branch-a", fromPort: "out", toPort: "in" },
        { from: "plan-root", to: "branch-b", fromPort: "out", toPort: "in" },
        { from: "plan-root", to: "branch-c", fromPort: "out", toPort: "in" },
        { from: "branch-a", to: "join-node", fromPort: "outA", toPort: "a" },
        { from: "branch-b", to: "join-node", fromPort: "outB", toPort: "b" },
        { from: "branch-c", to: "join-node", fromPort: "outC", toPort: "c" },
      ],
    };

    const graph = compileGraph(spec);
    const result = await scheduler.run("run-fanout", graph);

    expect(result.status).toBe("SUCCEEDED");
    expect(maxActiveGenerations).toBe(3);
  });

  it("retries on transient failure and then succeeds", async () => {
    const db = createMockDb();
    const eventBus = new EventBus({ db });
    const adapter = new MockAdapter({ failuresBeforeSuccess: 1 });
    let sleepCalled = false;

    const scheduler = new Scheduler({
      adapter,
      eventBus,
      db,
      sleepFn: async (ms) => {
        sleepCalled = true;
        expect(ms).toBe(1000);
      },
    });

    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-1",
          kind: "PLAN",
          label: "Plan",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "img-1",
          kind: "IMAGE_GENERATE",
          label: "Image",
          inputs: { in: "plan-1.out" },
          outputs: ["out"],
        },
      ],
      edges: [{ from: "plan-1", to: "img-1", fromPort: "out", toPort: "in" }],
    };

    const graph = compileGraph(spec);
    const result = await scheduler.run("run-retry", graph);

    expect(result.status).toBe("SUCCEEDED");
    expect(sleepCalled).toBe(true);
  });

  it("triggers longer backoff on rate limit", async () => {
    const db = createMockDb();
    const eventBus = new EventBus({ db });
    // rateLimitEvery: 2 means call 2 triggers rate limit, call 3 succeeds
    const adapter = new MockAdapter({ rateLimitEvery: 2 });
    const sleepDurations: number[] = [];

    const scheduler = new Scheduler({
      adapter,
      eventBus,
      db,
      sleepFn: async (ms) => {
        sleepDurations.push(ms);
      },
    });

    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-1",
          kind: "PLAN",
          label: "Plan",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "img-1",
          kind: "IMAGE_GENERATE",
          label: "Image 1",
          inputs: { in: "plan-1.out" },
          outputs: ["out1"],
        },
        {
          id: "img-2",
          kind: "IMAGE_GENERATE",
          label: "Image 2",
          inputs: { in: "img-1.out1" },
          outputs: ["out2"],
        },
      ],
      edges: [
        { from: "plan-1", to: "img-1", fromPort: "out", toPort: "in" },
        { from: "img-1", to: "img-2", fromPort: "out1", toPort: "in" },
      ],
    };

    const graph = compileGraph(spec);
    const result = await scheduler.run("run-ratelimit", graph);

    expect(result.status).toBe("SUCCEEDED");
    // Verify rate limit backoff triggered with 5000ms base
    expect(sleepDurations.some((ms) => ms >= 5000)).toBe(true);
  });

  it("marks the run FAILED and downstream nodes SKIPPED on persistent failure", async () => {
    const db = createMockDb();
    const eventBus = new EventBus({ db });
    const adapter = new MockAdapter({ failuresBeforeSuccess: 10 });

    const scheduler = new Scheduler({
      adapter,
      eventBus,
      db,
      sleepFn: async () => {},
    });

    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-1",
          kind: "PLAN",
          label: "Plan",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "img-1",
          kind: "IMAGE_GENERATE",
          label: "Image",
          inputs: { in: "plan-1.out" },
          outputs: ["out"],
        },
        {
          id: "compose-final",
          kind: "COMPOSE",
          label: "Compose",
          inputs: { in: "img-1.out" },
          outputs: [],
        },
      ],
      edges: [
        { from: "plan-1", to: "img-1", fromPort: "out", toPort: "in" },
        { from: "img-1", to: "compose-final", fromPort: "out", toPort: "in" },
      ],
    };

    const graph = compileGraph(spec);
    const result = await scheduler.run("run-fail", graph);

    expect(result.status).toBe("FAILED");
    const composeRecord = await db.node.findUnique({
      where: { id: "compose-final" },
    });
    expect(
      (composeRecord as unknown as { status: string })?.status,
    ).toBe("SKIPPED");
  });

  it("inserts a new node on regeneration and respects the 2-per-node cap", async () => {
    const db = createMockDb();
    const eventBus = new EventBus({ db });
    const adapter = new MockAdapter({
      critiqueScore: 0.4,
      critiqueIssues: ["poor lighting"],
    });

    const scheduler = new Scheduler({
      adapter,
      eventBus,
      db,
      sleepFn: async () => {},
    });

    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-1",
          kind: "PLAN",
          label: "Plan",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "img-target",
          kind: "IMAGE_GENERATE",
          label: "Target Image",
          inputs: { in: "plan-1.out" },
          outputs: ["out"],
        },
        {
          id: "critique-1",
          kind: "CRITIQUE",
          label: "Critique",
          inputs: { in: "img-target.out" },
          outputs: [],
        },
      ],
      edges: [
        { from: "plan-1", to: "img-target", fromPort: "out", toPort: "in" },
        {
          from: "img-target",
          to: "critique-1",
          fromPort: "out",
          toPort: "in",
        },
      ],
    };

    const graph = compileGraph(spec);
    const result = await scheduler.run("run-regen", graph);

    expect(result.status).toBe("SUCCEEDED");
    // Should have created img-target-regen-1 and img-target-regen-2
    const regenNode1 = graph.nodes.find((n) => n.id === "img-target-regen-1");
    const regenNode2 = graph.nodes.find((n) => n.id === "img-target-regen-2");
    const regenNode3 = graph.nodes.find((n) => n.id === "img-target-regen-3");

    expect(regenNode1).toBeDefined();
    expect(regenNode2).toBeDefined();
    expect(regenNode3).toBeUndefined(); // Cap at 2 enforced
  });
});
