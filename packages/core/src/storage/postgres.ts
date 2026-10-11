import type { RetryingPrismaClient } from "@chroma/db";
import { createHash } from "node:crypto";
import type { Artifact, ArtifactKind } from "../types/index.js";

/**
 * Determines file extension from MIME type.
 * @param mimeType MIME type string.
 */
function getExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/svg+xml":
      return ".svg";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "application/json":
      return ".json";
    case "text/plain":
      return ".txt";
    default:
      return ".bin";
  }
}

/**
 * Maps a MIME type to an ArtifactKind enum value.
 * @param mimeType MIME type string.
 */
function getArtifactKind(mimeType: string): ArtifactKind {
  if (mimeType.startsWith("image/")) {
    return "IMAGE";
  }
  if (mimeType === "application/json") {
    return "JSON";
  }
  return "TEXT";
}

/**
 * Writes an artifact's binary payload into the Artifact.data column.
 *
 * @param db PrismaClient instance.
 * @param nodeId The ID of the node that generated this artifact.
 * @param bytes The raw artifact bytes.
 * @param mimeType The MIME type of the artifact.
 * @param width Optional image width in pixels.
 * @param height Optional image height in pixels.
 * @param metadata Optional metadata payload.
 * @returns The created Artifact database record.
 */
export async function writeArtifact(
  db: RetryingPrismaClient,
  nodeId: string,
  bytes: Uint8Array,
  mimeType: string,
  width?: number,
  height?: number,
  metadata?: Record<string, unknown>,
): Promise<Artifact> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `${hash}${getExtension(mimeType)}`;
  const kind = getArtifactKind(mimeType);

  const artifactRecord = await db.artifact.create({
    data: {
      nodeId,
      kind,
      mimeType,
      storageKey,
      sha256: hash,
      data: Buffer.from(bytes),
      width: width ?? null,
      height: height ?? null,
      metadata: metadata ? (metadata as object) : undefined,
    },
  });

  return artifactRecord as unknown as Artifact;
}

/**
 * Reads an artifact's binary payload from the Artifact.data column.
 *
 * @param db PrismaClient instance.
 * @param artifactId The ID of the artifact to read.
 * @returns Binary content and MIME type.
 * @throws {Error} If the artifact record is missing or has no stored bytes.
 */
export async function readArtifact(
  db: RetryingPrismaClient,
  artifactId: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const record = await db.artifact.findUnique({
    where: { id: artifactId },
  });

  if (!record?.data) {
    throw new Error(`Artifact not found: "${artifactId}"`);
  }

  return {
    bytes: new Uint8Array(record.data),
    mimeType: record.mimeType,
  };
}
