/**
 * Composite image adapter.
 *
 * Wraps a primary image provider and an automatic fallback: the primary
 * (Cloudflare Workers AI) is always tried first, and the fallback (KIE AI) is
 * only reached when the primary rejects with a ProviderError (network fault,
 * rate limit, upstream outage, misconfiguration).
 *
 * Non-ProviderError rejections (programming errors) are rethrown untouched
 * rather than masked behind the fallback.
 */

import {
  ProviderError,
  type CompleteTextRequest,
  type CompleteTextResult,
  type CritiqueResult,
  type EditImageRequest,
  type GenerateImageRequest,
  type ImageArtifactResult,
  type ProviderAdapter,
  type ScoreImageRequest,
} from "@chroma/core";

/**
 * ProviderAdapter that tries the primary adapter, then the fallback adapter.
 */
export class CompositeImageAdapter implements ProviderAdapter {
  /**
   * @param primary Preferred image provider, tried on every call.
   * @param fallback Used only when the primary throws a ProviderError.
   */
  constructor(
    private readonly primary: ProviderAdapter,
    private readonly fallback: ProviderAdapter,
  ) {}

  /**
   * Generates an image via the primary, falling back on ProviderError.
   *
   * @param req The image generation parameters.
   * @returns The primary result when it succeeds, otherwise the fallback result.
   * @throws The original error when the primary fails with a non-ProviderError,
   *         or the fallback error when both adapters fail.
   */
  async generateImage(
    req: GenerateImageRequest,
  ): Promise<ImageArtifactResult> {
    let primaryError: unknown;
    try {
      return await this.primary.generateImage(req);
    } catch (error) {
      primaryError = error;
    }

    if (!(primaryError instanceof ProviderError)) {
      throw primaryError;
    }

    console.warn(
      `[chroma] primary image provider failed, trying fallback: ${primaryError.message}`,
    );

    return this.fallback.generateImage(req);
  }

  /**
   * Image editing is delegated to the primary only (no fallback).
   *
   * @param req The image editing parameters.
   * @returns The primary adapter's result.
   */
  editImage(req: EditImageRequest): Promise<ImageArtifactResult> {
    return this.primary.editImage(req);
  }

  /**
   * Image scoring is delegated to the primary only (no fallback).
   *
   * @param req The image scoring request.
   * @returns The primary adapter's result.
   */
  scoreImage(req: ScoreImageRequest): Promise<CritiqueResult> {
    return this.primary.scoreImage(req);
  }

  /**
   * Text completion is delegated to the primary only (no fallback).
   *
   * @param req The text completion parameters.
   * @returns The primary adapter's result.
   */
  completeText(req: CompleteTextRequest): Promise<CompleteTextResult> {
    return this.primary.completeText(req);
  }
}
