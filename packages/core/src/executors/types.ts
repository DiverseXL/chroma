import { PrismaClient } from "@chroma/db";
import type { ProviderAdapter } from "../provider/adapter.js";
import type { Artifact } from "../types/index.js";

/**
 * Interface allowing node executors to persist generated artifacts without knowing storage details.
 */
export interface ArtifactWriter {
  /**
   * Writes artifact binary bytes and saves an Artifact record.
   * @param bytes Raw byte array of the artifact.
   * @param mimeType MIME type string.
   * @param width Optional pixel width.
   * @param height Optional pixel height.
   * @param metadata Optional metadata.
   */
  write(
    bytes: Uint8Array,
    mimeType: string,
    width?: number,
    height?: number,
    metadata?: Record<string, unknown>,
  ): Promise<Artifact>;
}

/**
 * Execution context provided to each node executor during scheduling.
 */
export interface ExecutionContext {
  adapter: ProviderAdapter;
  db: PrismaClient;
  runId: string;
  nodeId: string;
  artifacts: ArtifactWriter;
}

/**
 * Common node executor function signature.
 */
export type NodeExecutor<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  ctx: ExecutionContext,
) => Promise<TOutput>;
