import { prisma } from "@chroma/db";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Retrieves the snapshot status of a run, including its nodes, edges, artifacts, and latest sequence counter.
 *
 * @param _req HTTP request object.
 * @param context Dynamic route parameters resolving the run ID.
 * @returns JSON response containing the run snapshot.
 */
export async function GET(
  _req: Request,
  context: RouteParams,
): Promise<NextResponse> {
  const { id } = await context.params;

  const run = await prisma.run.findUnique({
    where: { id },
  });

  if (!run) {
    return NextResponse.json({ error: `Run not found: ${id}` }, { status: 404 });
  }

  const [nodes, edges, artifacts, eventAgg] = await Promise.all([
    prisma.node.findMany({
      where: { runId: id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.edge.findMany({
      where: { runId: id },
    }),
    prisma.artifact.findMany({
      where: { node: { runId: id } },
      orderBy: { createdAt: "asc" },
      // Artifact.data holds the raw image bytes (now persisted in Postgres).
      // The canvas loads those through /api/artifacts/:id, so embedding them
      // here would balloon this snapshot into multi-MB JSON (Vercel caps
      // response bodies at 4.5 MB on Hobby).
      select: {
        id: true,
        nodeId: true,
        kind: true,
        mimeType: true,
        storageKey: true,
        sha256: true,
        width: true,
        height: true,
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.event.aggregate({
      where: { runId: id },
      _max: { sequence: true },
    }),
  ]);

  return NextResponse.json({
    run,
    nodes,
    edges,
    artifacts,
    latestSequence: eventAgg._max.sequence ?? 0,
  });
}
