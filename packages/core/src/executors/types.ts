import type { RetryingPrismaClient } from "@chroma/db";
import type { ProviderAdapter } from "../provider/adapter.js";
import type { Artifact } from "../types/index.js";

/**
 * The three capability-specific provider adapters exposed to executors.
 */
export interface ProviderSet {
  /** Handles image generation (e.g. Cloudflare Workers AI). */
  image: ProviderAdapter;
  /** Handles image scoring and vision critique (e.g. Google Gemini vision). */
  vision: ProviderAdapter;
  /** Handles text completion (e.g. Google Gemini text). */
  text: ProviderAdapter;
}

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
  /**
   * Capability-keyed provider adapters.
   * Use ctx.providers.image for generation, ctx.providers.vision for scoring,
   * and ctx.providers.text for text completion.
   */
  providers: ProviderSet;
  /**
   * Legacy single-adapter reference retained for backward compatibility
   * with test fixtures that create a Scheduler with a single MockAdapter.
   * Executors should prefer ctx.providers.
   */
  adapter: ProviderAdapter;
  db: RetryingPrismaClient;
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
