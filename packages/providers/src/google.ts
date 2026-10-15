/**
 * Google Gemini provider adapter.
 *
 * Implements text completion and vision-based image scoring via the
 * `generateContent` REST API. All model IDs and endpoint details are sourced
 * from live documentation and verified probe results recorded in
 * `docs/provider-facts.md` (sections A3, A7).
 *
 * Confirmed endpoint (A7):
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * Confirmed auth header (A7):
 *   x-goog-api-key: ${GEMINI_API_KEY}
 * Confirmed request body shape (A7):
 *   { contents: [{ parts: [{ text }] }] }
 * Confirmed response path (A7):
 *   candidates[0].content.parts[0].text
 * Confirmed error envelope (probe result, section "Observed error envelope"):
 *   { error: { message: string, code: string } }
 * Confirmed JSON output flag (A7):
 *   generationConfig.responseMimeType = "application/json"
 * Confirmed inline image part shape (A7, curl sample):
 *   { inline_data: { mime_type: "image/jpeg", data: "<BASE64>" } }
 */

import {
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

import { fetchWithTimeout, isTransientNetworkError } from "./http.js";

/**
 * Base URL for the Google Gemini generateContent REST endpoint.
 * Source: https://ai.google.dev/api/generate-content (A7)
 */
const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Reads and validates the Google adapter configuration from the environment.
 *
 * @param env Process environment or a stub.
 * @returns Validated API key and model IDs.
 * @throws {ProviderError} When any required setting is absent.
 */
function readConfig(env: {
  GEMINI_API_KEY?: string;
  GOOGLE_MODEL_TEXT?: string;
  GOOGLE_MODEL_VISION?: string;
}): { apiKey: string; textModel: string; visionModel: string } {
  const apiKey = env.GEMINI_API_KEY?.trim();
  const textModel = env.GOOGLE_MODEL_TEXT?.trim();
  const visionModel = env.GOOGLE_MODEL_VISION?.trim();

  if (!apiKey) {
    throw new ProviderError(
      "Google adapter requires GEMINI_API_KEY to be set",
      { code: "misconfigured" },
    );
  }
  if (!textModel) {
    throw new ProviderError(
      "Google adapter requires GOOGLE_MODEL_TEXT to be set",
      { code: "misconfigured" },
    );
  }
  if (!visionModel) {
    throw new ProviderError(
      "Google adapter requires GOOGLE_MODEL_VISION to be set",
      { code: "misconfigured" },
    );
  }

  return { apiKey, textModel, visionModel };
}

/**
 * Builds the generateContent URL for a given model ID.
 *
 * @param model Model identifier as returned by ListModels (e.g. "gemini-3.8-flash").
 */
function buildUrl(model: string): string {
  return `${GEMINI_BASE_URL}/${model}:generateContent`;
}

/**
 * Delays (ms) before each in-model retry for transient HTTP 5xx responses:
 * attempt 1 is the initial call, then waits of 1s, 2s, and 4s precede the
 * three retries before the chain advances to the next model.
 */
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** Total attempts per model: one initial call plus RETRY_DELAYS_MS retries. */
const MAX_ATTEMPTS_PER_MODEL = 1 + RETRY_DELAYS_MS.length;

/**
 * Sleep function used between in-model retries. Tests inject a stub via
 * GoogleAdapterOptions so retry tests run without real delays.
 */
export type GoogleSleepFn = (ms: number) => Promise<void>;

const defaultSleep: GoogleSleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Optional construction settings for GoogleGeminiAdapter. */
export interface GoogleAdapterOptions {
  /** Overrides the sleep used between 5xx retries (tests stub this). */
  sleep?: GoogleSleepFn;
}

/**
 * Extracts the human-readable error message from a Google API error response.
 *
 * Confirmed error envelope (probe result):
 *   { "error": { "message": "<string>", "code": "<string>" } }
 *
 * @param body Parsed response body.
 */
function extractErrorMessage(body: unknown): string {
  if (
    body !== null &&
    typeof body === "object" &&
    "error" in body
  ) {
    const err = (body as { error: unknown }).error;
    if (err !== null && typeof err === "object" && "message" in err) {
      const msg = (err as { message: unknown }).message;
      if (typeof msg === "string") {
        return msg;
      }
    }
  }
  return "Unknown Google API error";
}

/**
 * Converts a non-2xx Google API response to the appropriate ProviderError.
 *
 * @param response The failed fetch response.
 * @param status HTTP status code.
 * @param body Parsed response JSON (or null if unparseable).
 */
function toProviderError(
  status: number,
  body: unknown,
): ProviderError {
  const message = extractErrorMessage(body);

  if (status === 429) {
    return new ProviderRateLimitError(
      `Google API rate limited the request (HTTP 429): ${message}`,
    );
  }
  if (status === 404) {
    return new ProviderError(
      `Google API model was not found (HTTP 404): ${message}`,
      { code: "model_not_found" },
    );
  }
  if (status === 401) {
    return new ProviderError(
      `Google API rejected the API key (HTTP 401): ${message}`,
      { code: "unauthorized" },
    );
  }
  if (status >= 500) {
    // Transient server-side failures (500/502/503/...) are retried in-model
    // by callWithModelFallback before the chain advances.
    return new ProviderError(
      `Google API request failed with HTTP ${status}: ${message}`,
      { code: "server_error" },
    );
  }
  return new ProviderError(
    `Google API request failed with HTTP ${status}: ${message}`,
    { code: "provider_error" },
  );
}

/**
 * True for transient HTTP 5xx failures that warrant an in-model retry.
 */
function isServerError(error: unknown): boolean {
  return error instanceof ProviderError && error.code === "server_error";
}

/**
 * True for errors that should advance the model chain immediately:
 * 429 quota exhaustion or a 404 retired model.
 */
function isChainAdvanceError(error: unknown): boolean {
  return (
    error instanceof ProviderRateLimitError ||
    (error instanceof ProviderError && error.code === "model_not_found")
  );
}

/**
 * Issues a POST to the generateContent endpoint and returns the parsed body.
 *
 * @param model Model identifier.
 * @param apiKey Google AI Studio API key.
 * @param requestBody The JSON request payload.
 */
async function callGenerateContent(
  model: string,
  apiKey: string,
  requestBody: unknown,
): Promise<unknown> {
  const url = buildUrl(model);

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (cause) {
    const message = `Google API network request failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    // Transient network faults (20s budget abort, undici headers/body
    // timeouts, socket errors) map to ProviderRateLimitError so they follow
    // the same fallback chain as 429/503 and reach the planner's
    // deterministic storyboard instead of failing the run.
    if (isTransientNetworkError(cause)) {
      throw new ProviderRateLimitError(message);
    }
    throw new ProviderError(message, { cause, code: "network" });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw toProviderError(response.status, body);
  }

  return body;
}

/**
 * Tries models in preference order.
 *
 * Error handling per attempt:
 * - HTTP 5xx (server_error): retried against the same model up to three
 *   times (1s/2s/4s), logging a dev-only warning line, then the chain
 *   advances to the next model.
 * - 429 quota / 404 retired model: advance to the next model immediately.
 * - Transient network faults (20s budget abort, socket/DNS errors): mapped
 *   to ProviderRateLimitError, which also advances the chain immediately.
 * - Anything else (401/400/malformed): thrown unchanged, no retry.
 *
 * When every model is exhausted the last error is rethrown as a
 * ProviderRateLimitError so upstream fallbacks (planner's deterministic
 * storyboard, the critic's heuristic result) can engage instead of failing
 * the run.
 *
 * @param models Model IDs in preference order (deduplicated).
 * @param apiKey Google AI Studio API key.
 * @param requestBody The JSON request payload.
 * @param sleep Injectable sleep used between in-model retries.
 */
async function callWithModelFallback(
  models: string[],
  apiKey: string,
  requestBody: unknown,
  sleep: GoogleSleepFn,
): Promise<{ body: unknown; model: string }> {
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return {
          body: await callGenerateContent(model, apiKey, requestBody),
          model,
        };
      } catch (error) {
        lastError = error;

        if (isChainAdvanceError(error)) {
          break;
        }
        if (!isServerError(error)) {
          throw error;
        }
        if (attempt === MAX_ATTEMPTS_PER_MODEL) {
          break;
        }

        const delayMs = RETRY_DELAYS_MS[attempt - 1];
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[google] ${model} attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL} failed (${error instanceof Error ? error.message : String(error)}); retrying in ${delayMs}ms`,
          );
        }
        await sleep(delayMs);
      }
    }
  }

  const lastMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new ProviderRateLimitError(
    `Google API models exhausted without a successful response (last error: ${lastMessage})`,
  );
}

/**
 * Builds result metadata, flagging `fallback` when the served model differs
 * from the preferred (first) model in the chain.
 *
 * @param model Model that produced the response.
 * @param models The deduplicated preference chain that was used.
 */
function buildMetadata(
  model: string,
  models: string[],
): Record<string, unknown> {
  return model !== models[0] ? { model, fallback: true } : { model };
}

/**
 * Extracts the text content from candidates[0].content.parts[0].text.
 *
 * Confirmed response path (A7, observed probe result):
 *   candidates[0].content.parts[0].text
 *
 * @param body Parsed API response body.
 * @throws {ProviderError} When the expected path is absent.
 */
function extractResponseText(body: unknown): string {
  if (
    body !== null &&
    typeof body === "object" &&
    "candidates" in body
  ) {
    const candidates = (body as { candidates: unknown[] }).candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const first = candidates[0];
      if (
        first !== null &&
        typeof first === "object" &&
        "content" in first
      ) {
        const content = (first as { content: unknown }).content;
        if (
          content !== null &&
          typeof content === "object" &&
          "parts" in content
        ) {
          const parts = (content as { parts: unknown[] }).parts;
          if (Array.isArray(parts) && parts.length > 0) {
            const part = parts[0];
            if (
              part !== null &&
              typeof part === "object" &&
              "text" in part
            ) {
              const text = (part as { text: unknown }).text;
              if (typeof text === "string") {
                return text;
              }
            }
          }
        }
      }
    }
  }
  throw new ProviderError(
    "Google API response did not contain candidates[0].content.parts[0].text",
    { code: "malformed_response" },
  );
}

/**
 * ProviderAdapter backed by the Google Gemini generateContent REST API.
 *
 * Text and prompt-compilation calls use GOOGLE_MODEL_TEXT.
 * Vision-based scoring calls use GOOGLE_MODEL_VISION.
 */
export class GoogleGeminiAdapter implements ProviderAdapter {
  private readonly sleep: GoogleSleepFn;

  constructor(options: GoogleAdapterOptions = {}) {
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * Generates a text completion via the Gemini generateContent endpoint.
   *
   * The system prompt (if present) is prepended to the user prompt separated
   * by two newlines, as there is no dedicated system instruction field in the
   * generateContent parts array.
   *
   * When req.json is true, sets generationConfig.responseMimeType to
   * "application/json" and JSON.parses the output text. On parse failure,
   * throws ProviderError with code "invalid_json".
   *
   * @param req Text completion parameters.
   */
  async completeText(req: CompleteTextRequest): Promise<CompleteTextResult> {
    const { apiKey, textModel } = readConfig(process.env);
    // Fallback chain, preference order. The whole 2.x family (gemini-2.0-flash,
    // gemini-2.5-flash, gemini-2.5-flash-lite) returns HTTP 404 "no longer
    // available to new users" for current API keys (live-confirmed 2026-10-11),
    // so only live 3.x models are listed here; Google's error text points at
    // gemini-3.8-flash / gemini-3.5-flash-lite as replacements.
    const models = [...new Set([
      textModel,
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
    ])];

    const promptText =
      req.system != null ? `${req.system}\n\n${req.prompt}` : req.prompt;

    const requestBody: Record<string, unknown> = {
      contents: [
        {
          parts: [{ text: promptText }],
        },
      ],
    };

    const generationConfig: Record<string, unknown> = {};
    if (req.json) {
      // Source: https://ai.google.dev/api/generate-content (A7)
      generationConfig.responseMimeType = "application/json";
    }
    if (req.temperature !== undefined) {
      generationConfig.temperature = req.temperature;
    }
    if (req.maxOutputTokens !== undefined) {
      generationConfig.maxOutputTokens = req.maxOutputTokens;
    }
    if (Object.keys(generationConfig).length > 0) {
      requestBody.generationConfig = generationConfig;
    }

    const { body, model } = await callWithModelFallback(
      models,
      apiKey,
      requestBody,
      this.sleep,
    );
    const text = extractResponseText(body);
    const metadata = buildMetadata(model, models);

    if (!req.json) {
      return { text, metadata };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError(
        `Google API returned invalid JSON for a JSON-mode request: ${text.slice(0, 200)}`,
        { code: "invalid_json" },
      );
    }

    return { text, parsed, metadata };
  }

  /**
   * Evaluates an image against a scoring rubric using the vision model.
   *
   * The image bytes must be pre-encoded as base64 and provided in
   * req.imageBase64. The rubric text instructs the model to return strict
   * JSON: { "score": number, "feedback": string, "issues": string[] }.
   *
   * Inline image part shape confirmed by curl sample in A7:
   *   { inline_data: { mime_type: "image/jpeg", data: "<BASE64>" } }
   * We use "image/png" as that is the format produced by the Cloudflare adapter.
   *
   * @param req Score image request, must include imageBase64.
   * @throws {ProviderError} When imageBase64 is absent or the response cannot be parsed.
   */
  async scoreImage(req: ScoreImageRequest): Promise<CritiqueResult> {
    const { apiKey, visionModel } = readConfig(process.env);
    // Live 3.x chain only — see the note in completeText: the 2.x family is
    // 404-retired for current API keys, and both models below were probed
    // image-capable with responseMimeType=application/json (2026-10-11).
    const models = [...new Set([
      visionModel,
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
    ])];

    if (!req.imageBase64) {
      throw new ProviderError(
        "GoogleGeminiAdapter.scoreImage requires imageBase64 to be populated before calling",
        { code: "missing_image_bytes" },
      );
    }

    const requestBody = {
      contents: [
        {
          parts: [
            { text: req.rubric },
            {
              // Shape confirmed by curl sample in provider-facts.md A7.
              inline_data: {
                mime_type: "image/png",
                data: req.imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    };

    const { body, model } = await callWithModelFallback(
      models,
      apiKey,
      requestBody,
      this.sleep,
    );
    const text = extractResponseText(body);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError(
        `Google vision model returned invalid JSON: ${text.slice(0, 200)}`,
        { code: "invalid_json" },
      );
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).score !== "number"
    ) {
      throw new ProviderError(
        "Google vision model response did not contain a numeric 'score' field",
        { code: "malformed_response" },
      );
    }

    const result = parsed as {
      score: number;
      feedback?: string;
      issues?: string[];
    };

    return {
      score: result.score,
      feedback: typeof result.feedback === "string" ? result.feedback : "",
      issues: Array.isArray(result.issues) ? result.issues : [],
      metadata: buildMetadata(model, models),
    };
  }

  /**
   * Image generation is not implemented by this adapter.
   *
   * @param _req The image generation parameters.
   * @throws {ProviderError} Always, with code "not_implemented".
   */
  async generateImage(_req: GenerateImageRequest): Promise<ImageArtifactResult> {
    // TODO: The Gemini image generation (Nano Banana) models are not on the
    // free tier (A4, A5) and the quota was confirmed as 0/day (U1). Use the
    // Cloudflare adapter for all image generation.
    throw new ProviderError(
      "Use the Cloudflare adapter for image generation.",
      { code: "not_implemented" },
    );
  }

  /**
   * Image editing is not implemented by this adapter.
   *
   * @param _req The image editing parameters.
   * @throws {ProviderError} Always, with code "not_implemented".
   */
  async editImage(_req: EditImageRequest): Promise<ImageArtifactResult> {
    // TODO: Gemini image editing uses the same model ID as generation
    // (A2) but requires the paid tier. Not implemented until billing is enabled.
    throw new ProviderError(
      "Use the Cloudflare adapter for image editing.",
      { code: "not_implemented" },
    );
  }
}
