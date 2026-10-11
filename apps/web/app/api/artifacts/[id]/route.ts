import { readArtifact } from "@chroma/core";
import { prisma } from "@chroma/db";
import { NextResponse } from "next/server";

// Prisma only ships node_modules-native binaries, so this route must run on
// the Node.js runtime (not the Edge runtime) in serverless deployments.
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Serves raw binary artifacts stored in Postgres.
 *
 * @param _req Incoming HTTP request.
 * @param context Dynamic route parameters resolving the artifact ID.
 * @returns Binary file response with appropriate MIME type and Content-Length.
 */
export async function GET(
  _req: Request,
  context: RouteParams,
): Promise<Response> {
  const { id } = await context.params;

  try {
    const { bytes, mimeType } = await readArtifact(prisma, id);

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : `Artifact not found: ${id}`,
      },
      { status: 404 },
    );
  }
}
