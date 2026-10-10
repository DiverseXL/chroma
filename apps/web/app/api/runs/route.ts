import {
  compileGraph,
  executePlan,
  getMaxAttemptsForKind,
  writeArtifact,
  type CompiledGraph,
} from "@chroma/core";
import { prisma } from "@chroma/db";
import { NextResponse } from "next/server";
import { providers, scheduler } from "@/lib/engine";

/**
 * Handles creation of a new generation workflow run.
 * Scaffolds the database records, compiles the storyboard DAG, and launches scheduling asynchronously.
 *
 * @param req HTTP request containing the user's brief.
 * @returns JSON response with the generated runId.
 */
export async function POST(req: Request): Promise<NextResponse> {
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

  // Launch Scheduler in background (do not block HTTP response)
  scheduler.run(run.id, scheduledGraph).catch((err) => {
    console.error(`Scheduler background execution error for run ${run.id}:`, err);
  });

  return NextResponse.json({ runId: run.id });
}
