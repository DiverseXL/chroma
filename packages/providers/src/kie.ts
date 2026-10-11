/**
 * KIE AI provider adapter (https://docs.kie.ai).
 *
 * KIE image generation is asynchronous (docs/provider-facts.md K2):
 * POST /api/v1/jobs/createTask starts a task, then GET
 * /api/v1/jobs/recordInfo?taskId=... is polled until data.state leaves
 * waiting/queuing/generating. On success, data.resultJson is a JSON string
 * whose parsed form carries resultUrls[0] - the downloadable image URL (K3).
 *
 * KIE answers with HTTP 200 and an error "code" in the body (K1), so this
 * adapter checks the body code, not just the HTTP status.
 *
 * Credits: 1 credit = $0.005; nano-banana-2 at 1K costs 8 credits (K4).
 * Credit balance endpoint: GET /api/v1/chat/credit (K9).
 */

import {
  ProviderError,
  ProviderRateLimitError,
  type CompleteTextResult,
  type CritiqueResult,
  type GenerateImageRequest,
  type ImageArtifactResult,
  type ProviderAdapter,
} from "@chroma/core";

/**
 * Documented default base URL (docs/provider-facts.md K1).
 */
export const KIE_DEFAULT_BASE_URL = "https://api.kie.ai";

/**
 * Default image model (nano-banana-2, 8 credits at 1K; docs/provider-facts.md K4).
 */
export const KIE_DEFAULT_MODEL = "nano-banana-2";

/**
 * Fallback pixel dimensions used when the caller omits width/height.
 * Matches the dimensions `executeImageGenerate` requests.
 */
const DEFAULT_DIMENSION = 512;

/** First poll delay; grows by POLL_BACKOFF after each poll, capped at POLL_MAX_INTERVAL_MS. */
const POLL_BASE_INTERVAL_MS = 2_500;
const POLL_BACKOFF = 1.5;
const POLL_MAX_INTERVAL_MS = 8_000;
/** Hard deadline for the whole createTask + polling flow (docs/provider-facts.md K8). */
const POLL_TIMEOUT_MS = 180_000;

/** Body shape KIE returns on every /api/v1/* call (docs/provider-facts.md K1). */
interface KieBody {
  code?: number;
  msg?: string;
  data?: Record<string, unknown> | null;
}

/** data payload of recordInfo while a task is running (docs/provider-facts.md K3). */
interface KieTaskData {
  state?: string;
  resultJson?: string;
  creditsConsumed?: number;
  failCode?: string | number;
  failMsg?: string;
}

/**
 * Reads and validates the KIE connection settings from the environment.
 *
 * @param env Process environment (or a stub during tests).
 * @returns The validated base URL, API key, and model.
 * @throws {ProviderError} When KIE_API_KEY is missing.
 */
function readConfig(env: {
  KIE_API_KEY?: string;
  KIE_BASE_URL?: string;
  KIE_MODEL?: string;
}): { baseUrl: string; apiKey: string; model: string } {
  const apiKey = env.KIE_API_KEY?.trim();
  const baseUrl = (
    env.KIE_BASE_URL?.trim() || KIE_DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const model = env.KIE_MODEL?.trim() || KIE_DEFAULT_MODEL;

  if (!apiKey) {
    throw new ProviderError("KIE adapter requires KIE_API_KEY to be set", {
      code: "misconfigured",
    });
  }

  return { baseUrl, apiKey, model };
}

/**
 * Derives the KIE aspect_ratio input from the requested pixel dimensions.
 *
 * @param req The image generation parameters.
 * @returns "16:9" when wider than tall, "9:16" when taller than wide,
 *          otherwise "1:1".
 */
function deriveAspectRatio(req: GenerateImageRequest): string {
  const width = req.width ?? DEFAULT_DIMENSION;
  const height = req.height ?? DEFAULT_DIMENSION;
  if (width > height) return "16:9";
  if (height > width) return "9:16";
  return "1:1";
}

/**
 * Resolves after the given delay; goes through the timer that vitest fakes.
 *
 * @param ms Delay in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a KIE endpoint and parses the JSON body.
 *
 * @param url Absolute request URL.
 * @param init Fetch init options.
 * @returns The HTTP status and the parsed (or empty) JSON body.
 * @throws {ProviderError} With code "network" when fetch itself rejects.
 */
async function requestJson(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: KieBody }> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new ProviderError(
      `KIE request failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause, code: "network" },
    );
  }

  const text = await response.text().catch(() => "");
  let body: KieBody = {};
  if (text.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed !== null && typeof parsed === "object") {
        body = parsed as KieBody;
      }
    } catch {
      // Non-JSON body; the HTTP status below carries the error.
    }
  }

  return { status: response.status, body };
}

/**
 * Builds the error to throw when a KIE body reports a non-200 code.
 *
 * @param context The endpoint that failed ("createTask" / "recordInfo").
 * @param code The body's `code`, or the HTTP status when the body had none.
 * @param message The body's `msg`, or a status-derived fallback.
 * @throws {ProviderError} With a stable code (unauthorized, insufficient_credits,
 *         or `kie_${code}`), or ProviderRateLimitError for 429.
 */
function throwKieBodyError(
  context: string,
  code: number,
  message: string,
): never {
  const detail = `KIE ${context} failed (code ${code}): ${message}`;
  if (code === 401) {
    throw new ProviderError(detail, { code: "unauthorized" });
  }
  if (code === 402) {
    throw new ProviderError(detail, { code: "insufficient_credits" });
  }
  if (code === 429) {
    throw new ProviderRateLimitError(detail);
  }
  throw new ProviderError(detail, { code: `kie_${code}` });
}

/**
 * Extracts the first downloadable image URL from recordInfo's success payload.
 *
 * @param resultJson data.resultJson - a JSON string carrying resultUrls.
 * @returns The first URL, or undefined when absent or unparseable.
 */
function firstResultUrl(resultJson: unknown): string | undefined {
  if (typeof resultJson !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(resultJson);
    if (parsed === null || typeof parsed !== "object") return undefined;
    const urls = (parsed as { resultUrls?: unknown }).resultUrls;
    if (Array.isArray(urls) && typeof urls[0] === "string") return urls[0];
  } catch {
    // resultJson was not parseable JSON.
  }
  return undefined;
}

/**
 * Detects the image format from the leading magic bytes.
 *
 * @param bytes Downloaded image payload.
 * @returns The MIME type, defaulting to image/png when unrecognized
 *          (UNCONFIRMED: KIE's default output_format is jpg).
 */
function sniffMimeType(bytes: Uint8Array): string {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return "image/webp";
  }
  return "image/png";
}

/**
 * Downloads an image URL once.
 *
 * @param url The image URL.
 * @returns The bytes on HTTP 200, or undefined plus the status on failure.
 * @throws {ProviderError} With code "network" when fetch itself rejects.
 */
async function tryDownload(
  url: string,
): Promise<{ bytes?: Uint8Array; status: number }> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new ProviderError(
      `KIE image download failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause, code: "network" },
    );
  }

  if (!response.ok) {
    return { status: response.status };
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    status: response.status,
  };
}

/**
 * Resolves a tempfile result URL into a direct download link.
 *
 * KIE tempfile URLs sometimes refuse direct fetches; POST
 * /api/v1/common/download-url returns a temporary link valid for 20 minutes
 * (probe-confirmed fallback, docs/provider-facts.md K3).
 *
 * @param baseUrl The KIE base URL.
 * @param apiKey The KIE API key.
 * @param imageUrl The original result URL.
 * @returns The temporary URL, or undefined when it could not be resolved.
 */
async function resolveDownloadUrl(
  baseUrl: string,
  apiKey: string,
  imageUrl: string,
): Promise<string | undefined> {
  try {
    const resolved = await requestJson(`${baseUrl}/api/v1/common/download-url`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: imageUrl }),
    });
    if (resolved.body.code !== 200) return undefined;
    const data = resolved.body.data;
    return typeof data === "string" ? data : undefined;
  } catch {
    // Network failure while resolving; keep the direct download status.
    return undefined;
  }
}

/**
 * ProviderAdapter backed by the KIE AI async image generation API.
 */
export class KIEAdapter implements ProviderAdapter {
  /**
   * Generates an image by POSTing createTask, polling recordInfo until the
   * task settles, then downloading resultUrls[0].
   *
   * @param req The image generation parameters.
   * @returns The downloaded image bytes plus KIE metadata.
   * @throws {ProviderError} On KIE body errors (unauthorized,
   *         insufficient_credits, `kie_*`), polling timeout (`kie_timeout`),
   *         failed tasks (`kie_task_failed`), or download failures.
   * @throws {ProviderRateLimitError} When KIE reports code 429.
   */
  async generateImage(
    req: GenerateImageRequest,
  ): Promise<ImageArtifactResult> {
    const { baseUrl, apiKey, model } = readConfig(process.env);

    // Step 1: create exactly one generation task (docs/provider-facts.md K2).
    const created = await requestJson(`${baseUrl}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: {
          prompt: req.prompt,
          aspect_ratio: deriveAspectRatio(req),
          resolution: "1K",
        },
      }),
    });
    if (created.body.code !== 200) {
      throwKieBodyError(
        "createTask",
        typeof created.body.code === "number"
          ? created.body.code
          : created.status,
        created.body.msg ?? `KIE createTask failed with HTTP ${created.status}`,
      );
    }
    const taskId = created.body.data?.taskId;
    if (typeof taskId !== "string" || taskId === "") {
      throw new ProviderError(
        "KIE createTask response missing data.taskId",
        { code: "kie_no_task_id" },
      );
    }

    // Step 2: poll the same task with backoff until it settles (K2/K8).
    const started = Date.now();
    let interval = POLL_BASE_INTERVAL_MS;
    let creditsConsumed: number | undefined;
    let imageUrl: string | undefined;

    for (;;) {
      if (Date.now() - started >= POLL_TIMEOUT_MS) {
        throw new ProviderError(
          `KIE task ${taskId} did not finish within ${POLL_TIMEOUT_MS / 1000}s`,
          { code: "kie_timeout" },
        );
      }

      const polled = await requestJson(
        `${baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (polled.body.code !== 200) {
        throwKieBodyError(
          "recordInfo",
          typeof polled.body.code === "number"
            ? polled.body.code
            : polled.status,
          polled.body.msg ??
            `KIE recordInfo failed with HTTP ${polled.status}`,
        );
      }

      const data = polled.body.data as KieTaskData | undefined;
      if (data?.state === "success") {
        creditsConsumed =
          typeof data.creditsConsumed === "number"
            ? data.creditsConsumed
            : undefined;
        imageUrl = firstResultUrl(data.resultJson);
        break;
      }
      if (data?.state === "fail") {
        throw new ProviderError(
          `KIE task failed (failCode ${data.failCode ?? "?"}): ${
            data.failMsg ?? "no failMsg reported"
          }`,
          { code: "kie_task_failed" },
        );
      }

      // waiting | queuing | generating (or unknown): back off and retry.
      await sleep(interval);
      interval = Math.min(
        Math.round(interval * POLL_BACKOFF),
        POLL_MAX_INTERVAL_MS,
      );
    }

    if (!imageUrl) {
      throw new ProviderError(
        "KIE task succeeded but data.resultJson carried no resultUrls[0]",
        { code: "kie_no_result_url" },
      );
    }

    // Step 3: download the image and sniff its real format (K3).
    const direct = await tryDownload(imageUrl);
    let bytes = direct.bytes;
    let status = direct.status;
    if (!bytes) {
      const temporaryUrl = await resolveDownloadUrl(baseUrl, apiKey, imageUrl);
      if (temporaryUrl) {
        const viaLink = await tryDownload(temporaryUrl);
        bytes = viaLink.bytes;
        status = viaLink.status;
      }
    }
    if (!bytes) {
      throw new ProviderError(
        `KIE image download failed with HTTP ${status}`,
        { code: `kie_${status}` },
      );
    }

    return {
      bytes,
      mimeType: sniffMimeType(bytes),
      width: req.width ?? DEFAULT_DIMENSION,
      height: req.height ?? DEFAULT_DIMENSION,
      metadata: {
        provider: "kie",
        model,
        creditsConsumed,
      },
    };
  }

  /**
   * KIE image editing requires publicly hosted source images (not implemented).
   *
   * @throws {ProviderError} Always, with code `not_implemented`.
   */
  async editImage(): Promise<ImageArtifactResult> {
    // TODO(post-deploy): add a /api/v1/images/edit task once source images
    // can be referenced by URL, then implement this method.
    throw new ProviderError(
      "KIE adapter does not support editImage yet",
      { code: "not_implemented" },
    );
  }

  /**
   * Image scoring is not part of the KIE API (use the Google adapter).
   *
   * @throws {ProviderError} Always, with code `not_implemented`.
   */
  async scoreImage(): Promise<CritiqueResult> {
    throw new ProviderError(
      "KIE adapter does not support scoreImage. Use the Google adapter for the critic.",
      { code: "not_implemented" },
    );
  }

  /**
   * Text completion is not part of the KIE API (use the Google adapter).
   *
   * @throws {ProviderError} Always, with code `not_implemented`.
   */
  async completeText(): Promise<CompleteTextResult> {
    throw new ProviderError(
      "KIE adapter does not support completeText. Use the Google adapter for text nodes.",
      { code: "not_implemented" },
    );
  }
}
