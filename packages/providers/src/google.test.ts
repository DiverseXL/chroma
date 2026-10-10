import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProviderError,
  ProviderRateLimitError,
} from "@chroma/core";
import { GoogleGeminiAdapter } from "./google.js";

const API_KEY = "test-gemini-key";
const TEXT_MODEL = "gemini-3.8-flash";
const VISION_MODEL = "gemini-3.8-flash";

const originalEnv = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_MODEL_TEXT: process.env.GOOGLE_MODEL_TEXT,
  GOOGLE_MODEL_VISION: process.env.GOOGLE_MODEL_VISION,
};

/**
 * Awaits a promise expected to reject and returns the rejection reason.
 *
 * @param promise Promise expected to reject.
 * @param label Description for the assertion failure message.
 */
async function captureRejection(
  promise: Promise<unknown>,
  label: string,
): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error(`Expected ${label} to reject, but it resolved`);
}

/**
 * Builds a well-formed Gemini generateContent success response body.
 *
 * @param text Text to embed in candidates[0].content.parts[0].text.
 */
function buildSuccessBody(text: string): unknown {
  return {
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
      },
    ],
  };
}

/** A 1-pixel PNG encoded as base64 for vision test stubs. */
const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("GoogleGeminiAdapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.GEMINI_API_KEY = API_KEY;
    process.env.GOOGLE_MODEL_TEXT = TEXT_MODEL;
    process.env.GOOGLE_MODEL_VISION = VISION_MODEL;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;
    process.env.GOOGLE_MODEL_TEXT = originalEnv.GOOGLE_MODEL_TEXT;
    process.env.GOOGLE_MODEL_VISION = originalEnv.GOOGLE_MODEL_VISION;
  });

  // --- completeText non-JSON ---

  it("completeText non-JSON returns text", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(buildSuccessBody("Hello world")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const adapter = new GoogleGeminiAdapter();
    const result = await adapter.completeText({
      prompt: "Say hello",
    });

    expect(result.text).toBe("Hello world");
    expect(result.parsed).toBeUndefined();
  });

  // --- completeText JSON mode ---

  it("completeText JSON returns parsed object", async () => {
    const obj = { answer: 42, tags: ["a", "b"] };
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(buildSuccessBody(JSON.stringify(obj))),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const adapter = new GoogleGeminiAdapter();
    const result = await adapter.completeText({
      prompt: "Return JSON",
      json: true,
    });

    expect(result.text).toBe(JSON.stringify(obj));
    expect(result.parsed).toEqual(obj);

    // Verify generationConfig.responseMimeType was sent
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig?.responseMimeType).toBe("application/json");
  });

  // --- completeText JSON invalid output ---

  it("completeText JSON with invalid model output throws ProviderError invalid_json", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(buildSuccessBody("not valid json { {")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const adapter = new GoogleGeminiAdapter();
    const error = await captureRejection(
      adapter.completeText({ prompt: "Give me JSON", json: true }),
      "completeText JSON with bad output",
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("invalid_json");
  });

  // --- scoreImage ---

  it("scoreImage returns score, feedback, and issues", async () => {
    const critiqueJson = {
      score: 0.92,
      feedback: "Well composed image",
      issues: ["slight blur on left edge"],
    };
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(buildSuccessBody(JSON.stringify(critiqueJson))),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const adapter = new GoogleGeminiAdapter();
    const result = await adapter.scoreImage({
      artifactId: "art-1",
      rubric: "Rate composition on a 0-1 scale",
      imageBase64: MOCK_PNG_BASE64,
    });

    expect(result.score).toBe(0.92);
    expect(result.feedback).toBe("Well composed image");
    expect(result.issues).toEqual(["slight blur on left edge"]);
  });

  // --- 429 throws ProviderRateLimitError ---

  it("429 throws ProviderRateLimitError", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Rate limit exceeded",
            code: "too_many_requests",
          },
        }),
        { status: 429 },
      ),
    );

    const adapter = new GoogleGeminiAdapter();
    const error = await captureRejection(
      adapter.completeText({ prompt: "Hello" }),
      "rate limited call",
    );

    expect(error).toBeInstanceOf(ProviderRateLimitError);
    expect((error as Error).message).toContain("429");
  });

  // --- 500 throws ProviderError with body message ---

  it("500 throws ProviderError with the message body", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Internal server error occurred",
            code: "internal",
          },
        }),
        { status: 500 },
      ),
    );

    const adapter = new GoogleGeminiAdapter();
    const error = await captureRejection(
      adapter.completeText({ prompt: "Hello" }),
      "server error call",
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).not.toBeInstanceOf(ProviderRateLimitError);
    expect((error as Error).message).toContain("Internal server error occurred");
  });

  // --- 401 throws ProviderError code unauthorized ---

  it("401 throws ProviderError with code unauthorized", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "API key not valid", code: "invalid_api_key" },
        }),
        { status: 401 },
      ),
    );

    const adapter = new GoogleGeminiAdapter();
    const error = await captureRejection(
      adapter.completeText({ prompt: "Hello" }),
      "unauthorized call",
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("unauthorized");
  });
});
