/**
 * Provider adapter interface, request and result contracts, and error definitions.
 */

export interface GenerateImageRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
  modelHint?: string;
}

export interface EditImageRequest {
  sourceArtifactId: string;
  instruction: string;
  preserveRegions?: string[];
}

export interface ScoreImageRequest {
  artifactId: string;
  rubric: string;
  /** Raw image bytes, base64-encoded. Populated by the executor before calling the adapter. */
  imageBase64?: string;
}

export interface ImageArtifactResult {
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
}

export interface CritiqueResult {
  score: number;
  feedback: string;
  issues: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Request parameters for text-completion calls.
 */
export interface CompleteTextRequest {
  /** Optional system-level instruction prepended before the user prompt. */
  system?: string;
  /** The user-facing prompt. */
  prompt: string;
  /**
   * When true the adapter must request structured JSON output from the model
   * and populate `parsed` with the parsed object. If parsing fails the adapter
   * throws ProviderError with code "invalid_json".
   */
  json?: boolean;
  /** Sampling temperature in the range [0, 2]. */
  temperature?: number;
  /** Maximum number of output tokens. */
  maxOutputTokens?: number;
}

/**
 * Result returned by a text-completion call.
 */
export interface CompleteTextResult {
  /** The raw model output text. */
  text: string;
  /** The parsed JSON object when req.json was true and parsing succeeded. */
  parsed?: unknown;
  /** Token usage reported by the provider. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Base error raised when a provider interaction fails.
 */
export class ProviderError extends Error {
  /**
   * Short machine-readable error code (e.g. "unauthorized", "invalid_json").
   */
  public readonly code?: string;

  /**
   * Initializes a ProviderError instance.
   * @param message Descriptive failure message.
   * @param options Optional code and cause.
   */
  constructor(
    message: string,
    options?: { cause?: unknown; code?: string },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ProviderError";
    this.code = options?.code;
  }
}

/**
 * Error raised when a provider rejects a request due to rate limiting.
 */
export class ProviderRateLimitError extends ProviderError {
  /**
   * Initializes a ProviderRateLimitError instance.
   * @param message Descriptive rate limit message.
   * @param retryAfterMs Optional delay in milliseconds suggested by provider.
   */
  constructor(message: string, public readonly retryAfterMs?: number) {
    super(message, { code: "rate_limit" });
    this.name = "ProviderRateLimitError";
  }
}

/**
 * Error raised when a provider refuses a prompt due to content safety filters.
 */
export class ProviderContentFilterError extends ProviderError {
  /**
   * Initializes a ProviderContentFilterError instance.
   * @param message Descriptive content filter message.
   */
  constructor(message: string) {
    super(message, { code: "content_filter" });
    this.name = "ProviderContentFilterError";
  }
}

/**
 * Structural check for rate-limit/unavailable provider errors.
 *
 * The app loads @chroma/core through two module graphs (Next's server bundle
 * for app code, the package's own ESM for @chroma/providers), so class
 * identity via `instanceof` is unreliable across that boundary in the running
 * server. Matching on `name`/`code` works in both graphs. Semantics match
 * ProviderRateLimitError exactly: every rate limit, provider-unavailable
 * exhaustion, or transient outage surfaces as this class with code
 * "rate_limit".
 *
 * @param error Any caught value.
 */
export function isProviderRateLimitError(error: unknown): boolean {
  if (error instanceof ProviderRateLimitError) return true;
  if (typeof error !== "object" || error === null) return false;
  const e = error as { name?: unknown; code?: unknown };
  return e.name === "ProviderRateLimitError" || e.code === "rate_limit";
}

/**
 * Structural check for content-filter provider errors; see
 * isProviderRateLimitError for why `instanceof` alone is not used.
 *
 * @param error Any caught value.
 */
export function isProviderContentFilterError(error: unknown): boolean {
  if (error instanceof ProviderContentFilterError) return true;
  if (typeof error !== "object" || error === null) return false;
  const e = error as { name?: unknown; code?: unknown };
  return (
    e.name === "ProviderContentFilterError" || e.code === "content_filter"
  );
}

/**
 * Common contract that every provider implementation must fulfill.
 */
export interface ProviderAdapter {
  /**
   * Generates an image based on the provided prompt and generation parameters.
   * @param req The image generation parameters.
   */
  generateImage(req: GenerateImageRequest): Promise<ImageArtifactResult>;

  /**
   * Modifies an existing image artifact following targeted instructions.
   * @param req The image editing parameters.
   */
  editImage(req: EditImageRequest): Promise<ImageArtifactResult>;

  /**
   * Evaluates an image artifact against a structured rubric.
   * @param req The image scoring request.
   */
  scoreImage(req: ScoreImageRequest): Promise<CritiqueResult>;

  /**
   * Generates a text completion for the given prompt.
   * When req.json is true the adapter requests structured JSON output and
   * populates CompleteTextResult.parsed. If parsing fails it throws
   * ProviderError with code "invalid_json".
   * @param req The text completion parameters.
   */
  completeText(req: CompleteTextRequest): Promise<CompleteTextResult>;
}
