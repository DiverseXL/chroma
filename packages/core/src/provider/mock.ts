import type {
  CritiqueResult,
  EditImageRequest,
  GenerateImageRequest,
  ImageArtifactResult,
  ProviderAdapter,
  ScoreImageRequest,
} from "./adapter.js";
import {
  ProviderError,
  ProviderRateLimitError,
} from "./adapter.js";

/**
 * Configuration options for simulating failures and rate limits in MockAdapter.
 */
export interface MockAdapterConfig {
  /**
   * Number of transient failures to produce before succeeding on subsequent calls.
   */
  failuresBeforeSuccess?: number;

  /**
   * Interval at which to emit a ProviderRateLimitError (e.g. every Nth call).
   */
  rateLimitEvery?: number;

  /**
   * Configurable score returned by scoreImage (defaults to 0.8).
   */
  critiqueScore?: number;

  /**
   * Configurable issues returned by scoreImage.
   */
  critiqueIssues?: string[];
}

/**
 * In-memory provider adapter that produces deterministic mock outputs for tests and local dev.
 */
export class MockAdapter implements ProviderAdapter {
  private callCount = 0;
  private failureCount = 0;
  private imageCounter = 0;

  /**
   * Initializes a new MockAdapter with optional fault injection configuration.
   * @param config Fault injection and test hooks.
   */
  constructor(private readonly config: MockAdapterConfig = {}) {}

  /**
   * Evaluates fault injection rules and throws configured errors if triggered.
   */
  private checkFaultInjection(): void {
    this.callCount += 1;

    if (
      this.config.rateLimitEvery !== undefined &&
      this.config.rateLimitEvery > 0 &&
      this.callCount % this.config.rateLimitEvery === 0
    ) {
      throw new ProviderRateLimitError(
        `Mock rate limit reached on call #${this.callCount}`,
        5000,
      );
    }

    if (
      this.config.failuresBeforeSuccess !== undefined &&
      this.failureCount < this.config.failuresBeforeSuccess
    ) {
      this.failureCount += 1;
      throw new ProviderError(
        `Mock transient error (${this.failureCount}/${this.config.failuresBeforeSuccess})`,
      );
    }
  }

  /**
   * Generates a deterministic small SVG mock image encoded as UTF-8 bytes.
   * @param req The image generation parameters.
   */
  async generateImage(
    req: GenerateImageRequest,
  ): Promise<ImageArtifactResult> {
    this.checkFaultInjection();
    this.imageCounter += 1;
    const label = `mock image ${this.imageCounter}`;
    const width = req.width ?? 512;
    const height = req.height ?? 512;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#1a1a2e"/><text x="50%" y="50%" fill="#e94560" font-size="24" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
    const bytes = new TextEncoder().encode(svg);

    return {
      bytes,
      mimeType: "image/svg+xml",
      width,
      height,
      metadata: {
        width,
        height,
        label,
        prompt: req.prompt,
      },
    };
  }

  /**
   * Generates a deterministic small SVG mock edited image encoded as UTF-8 bytes.
   * @param req The image editing parameters.
   */
  async editImage(req: EditImageRequest): Promise<ImageArtifactResult> {
    this.checkFaultInjection();
    this.imageCounter += 1;
    const label = `mock edited image ${this.imageCounter}`;
    const width = 512;
    const height = 512;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0f3460"/><text x="50%" y="50%" fill="#16213e" font-size="24" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
    const bytes = new TextEncoder().encode(svg);

    return {
      bytes,
      mimeType: "image/svg+xml",
      width,
      height,
      metadata: {
        width,
        height,
        label,
        instruction: req.instruction,
        sourceArtifactId: req.sourceArtifactId,
      },
    };
  }

  /**
   * Scores an image against a rubric and returns critique feedback.
   * @param req The score image request.
   */
  async scoreImage(req: ScoreImageRequest): Promise<CritiqueResult> {
    this.checkFaultInjection();
    return {
      score: this.config.critiqueScore ?? 0.8,
      feedback: "mock critique",
      issues: this.config.critiqueIssues ?? [],
    };
  }
}
