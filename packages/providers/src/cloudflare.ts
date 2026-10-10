/**
 * Cloudflare Workers AI provider adapter.
 *
 * Talks to the deployed Chroma Cloudflare Worker (`CF_WORKER_URL`), which is
 * bound to Workers AI and answers a text prompt with raw `image/png` bytes.
 * The worker auth secret is sent as `Authorization: Bearer ${CF_API_KEY}`.
 *
 * The worker does not report image dimensions, so width/height are echoed back
 * from the request (see `GenerateImageRequest`).
 */

import {
  ProviderContentFilterError,
  ProviderError,
  ProviderRateLimitError,
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
 * The image model the deployed worker is bound to.
 */
export const CLOUDFLARE_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/**
 * Substring the worker uses when it refuses a prompt on safety grounds.
 */
const NSFW_MARKER = "NSFW content";

/**
 * Fallback pixel dimensions used when the caller omits width/height.
 * Matches the dimensions `executeImageGenerate` requests.
 */
const DEFAULT_DIMENSION = 512;

/**
 * Reads and validates the worker connection settings from the environment.
 *
 * @param env Process environment (or a stub during tests).
 * @returns The validated worker URL and API key.
 * @throws {ProviderError} When either setting is missing.
 */
function readConfig(env: {
  CF_WORKER_URL?: string;
  CF_API_KEY?: string;
}): { workerUrl: string; apiKey: string } {
  const workerUrl = env.CF_WORKER_URL?.trim();
  const apiKey = env.CF_API_KEY?.trim();

  if (!workerUrl || !apiKey) {
    throw new ProviderError(
      "Cloudflare adapter requires CF_WORKER_URL and CF_API_KEY to be set",
    );
  }

  return { workerUrl, apiKey };
}

/**
 * Extracts a human-readable message from an error response body.
 *
 * Tries JSON first, preferring string `error` / `message` fields, and falls
 * back to the raw body text.
 *
 * @param rawBody Response body as text.
 * @returns The most descriptive message available.
 */
function extractMessage(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (trimmed === "") {
    return "";
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed !== null && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of ["error", "message", "detail"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim() !== "") {
          return value;
        }
      }
    }
  } catch {
    // Body was not JSON; fall back to the raw text below.
  }

  return trimmed;
}

/**
 * Builds the error to throw for a non-2xx worker response.
 *
 * @param response The failed fetch response (body not yet consumed).
 * @returns A ProviderError, ProviderRateLimitError, or ProviderContentFilterError.
 */
async function toProviderError(response: Response): Promise<ProviderError> {
  const rawBody = await response.text().catch(() => "");
  const message = extractMessage(rawBody);
  const detail = message === "" ? "" : `: ${message}`;

  if (response.status === 401) {
    return new ProviderError(
      `Cloudflare worker rejected the API key (HTTP 401)${detail}`,
      { code: "unauthorized" },
    );
  }

  if (response.status === 429) {
    return new ProviderRateLimitError(
      `Cloudflare worker rate limited the request (HTTP 429)${detail}`,
    );
  }

  // The worker reports safety refusals in the body regardless of status.
  if (rawBody.includes(NSFW_MARKER)) {
    return new ProviderContentFilterError(
      `Cloudflare worker rejected the prompt as unsafe (HTTP ${response.status})${detail}`,
    );
  }

  return new ProviderError(
    `Cloudflare worker request failed with HTTP ${response.status}${detail}`,
  );
}

/**
 * ProviderAdapter backed by the deployed Cloudflare Workers AI image worker.
 */
export class CloudflareWorkersAIAdapter implements ProviderAdapter {
  /**
   * Generates an image by POSTing the prompt to the deployed worker and
   * returning the raw PNG bytes it streams back.
   *
   * @param req The image generation parameters.
   * @returns The generated PNG plus echoed request metadata.
   */
  async generateImage(
    req: GenerateImageRequest,
  ): Promise<ImageArtifactResult> {
    const { workerUrl, apiKey } = readConfig(process.env);

    let response: Response;
    try {
      response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: req.prompt }),
      });
    } catch (cause) {
      throw new ProviderError(
        `Cloudflare worker request failed: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        { cause, code: "network" },
      );
    }

    if (!response.ok) {
      throw await toProviderError(response);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const width = req.width ?? DEFAULT_DIMENSION;
    const height = req.height ?? DEFAULT_DIMENSION;

    return {
      bytes,
      mimeType: "image/png",
      width,
      height,
      metadata: {
        provider: "cloudflare",
        model: CLOUDFLARE_IMAGE_MODEL,
      },
    };
  }

  /**
   * Image editing is not implemented by the Cloudflare worker.
   *
   * @param _req The image editing parameters.
   * @throws {ProviderError} Always, with code `not_implemented`.
   */
  async editImage(_req: EditImageRequest): Promise<ImageArtifactResult> {
    // TODO(Step 3): ask the worker to accept a source image + instruction and
    // return edited bytes, then implement this method.
    throw new ProviderError(
      "Cloudflare adapter does not support editImage yet",
      { code: "not_implemented" },
    );
  }

  /**
   * Image scoring is not implemented by the Cloudflare worker.
   *
   * @param _req The image scoring parameters.
   * @throws {ProviderError} Always, with code `not_implemented`.
   */
  async scoreImage(_req: ScoreImageRequest): Promise<CritiqueResult> {
    throw new ProviderError(
      "Cloudflare adapter does not support scoreImage. Use the Google adapter for the critic.",
      { code: "not_implemented" },
    );
  }

  /**
   * Text completion is not implemented by the Cloudflare image worker.
   *
   * @param _req The text completion parameters.
   * @throws {ProviderError} Always, with code `not_implemented`.
   */
  async completeText(_req: CompleteTextRequest): Promise<CompleteTextResult> {
    throw new ProviderError(
      "Cloudflare adapter does not support completeText. Use the Google adapter for text nodes.",
      { code: "not_implemented" },
    );
  }
}
