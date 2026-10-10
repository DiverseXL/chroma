import {
  compileGraph,
  executePlan,
  getMaxAttemptsForKind,
  writeArtifact,
} from "@chroma/core";
import { prisma } from "@chroma/db";
import { NextResponse } from "next/server";
import { mockAdapter, scheduler } from "@/lib/engine";

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

  // Call plan executor
  const planCtx = {
    adapter: mockAdapter,
    db: prisma,
    runId: run.id,
    nodeId: "plan-0",
    artifacts: {
      write: (
        bytes: Uint8Array,
        mimeType: string,
        width?: number,
        height?: number,
        metadata?: Record<string, unknown>,
      ) => writeArtifact(prisma, "plan-0", bytes, mimeType, width, height, metadata),
    },
  };

  const graphSpec = await executePlan(brief, planCtx);

  // Compile and validate the DAG
  const compiled = compileGraph(graphSpec);

  // Persist Node records in database
  for (const node of compiled.nodes) {
    await prisma.node.create({
      data: {
        id: node.id,
        runId: run.id,
        kind: node.kind,
        status: "PENDING",
        label: node.label,
        inputJson: (node.inputs ?? {}) as object,
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
        fromNodeId: edge.from,
        toNodeId: edge.to,
        fromPort: edge.fromPort,
        toPort: edge.toPort,
      },
    });
  }

  // Launch Scheduler in background (do not block HTTP response)
  scheduler.run(run.id, compiled).catch((err) => {
    console.error(`Scheduler background execution error for run ${run.id}:`, err);
  });

  return NextResponse.json({ runId: run.id });
}
