import { ZipArchive } from "archiver";
import { prisma } from "@chroma/db";
import { PassThrough, Readable } from "node:stream";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

function panelReferences(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];

  const panel = value as Record<string, unknown>;
  return ["artifactId", "imageId", "id", "nodeId"].flatMap((key) =>
    typeof panel[key] === "string" ? [panel[key] as string] : [],
  );
}

export async function GET(
  _req: Request,
  context: RouteParams,
): Promise<Response> {
  const { id } = await context.params;
  const run = await prisma.run.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!run) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [composeNode, artifacts] = await Promise.all([
    prisma.node.findFirst({
      where: { runId: id, kind: "COMPOSE" },
      select: { outputJson: true },
    }),
    prisma.artifact.findMany({
      where: { node: { runId: id }, kind: "IMAGE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, nodeId: true, mimeType: true, data: true },
    }),
  ]);

  if (artifacts.length === 0) {
    return NextResponse.json(
      {
        error: "no_artifacts",
        message: "This run has no images to download.",
      },
      { status: 404 },
    );
  }

  const composeOutput = composeNode?.outputJson;
  const panels =
    typeof composeOutput === "object" &&
    composeOutput !== null &&
    "panels" in composeOutput &&
    Array.isArray(composeOutput.panels)
      ? composeOutput.panels
      : null;

  const panelOrder = new Map<string, number>();
  panels?.forEach((panel, index) => {
    for (const reference of panelReferences(panel)) {
      if (!panelOrder.has(reference)) panelOrder.set(reference, index);
    }
  });

  const orderedArtifacts = [...artifacts].sort((a, b) => {
    const aOrder = panelOrder.get(a.id) ?? panelOrder.get(a.nodeId);
    const bOrder = panelOrder.get(b.id) ?? panelOrder.get(b.nodeId);
    if (aOrder !== undefined || bOrder !== undefined) {
      if (aOrder === undefined) return 1;
      if (bOrder === undefined) return -1;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }
    return 0;
  });

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const output = new PassThrough();
  archive.on("error", (error: Error) => output.destroy(error));
  archive.pipe(output);

  orderedArtifacts.forEach((artifact, index) => {
    if (!artifact.data) {
      archive.destroy(
        new Error(`Image artifact "${artifact.id}" has no stored image data`),
      );
      return;
    }
    const extension = artifact.mimeType === "image/jpeg" ? "jpg" : "png";
    archive.append(Buffer.from(artifact.data), {
      name: `panel-${index + 1}.${extension}`,
    });
  });

  void archive.finalize().catch((error: unknown) => {
    output.destroy(error instanceof Error ? error : new Error(String(error)));
  });

  return new Response(Readable.toWeb(output) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="chroma-${id}.zip"`,
    },
  });
}
