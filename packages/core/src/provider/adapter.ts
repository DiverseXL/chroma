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
}

/**
 * Base error raised when a provider interaction fails.
 */
export class ProviderError extends Error {
  /**
   * Initializes a ProviderError instance.
   * @param message Descriptive failure message.
   * @param cause Underlying error cause if present.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProviderError";
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
    super(message);
    this.name = "ProviderRateLimitError";
  }
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
}
