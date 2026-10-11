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
    vi.restoreAllMocks();
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
    expect(result.metadata).toEqual({ model: TEXT_MODEL });
  });

  it("falls back to the next text model after HTTP 429", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(buildSuccessBody("fallback response")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await new GoogleGeminiAdapter().completeText({
      prompt: "hello",
    });

    expect(result.text).toBe("fallback response");
    expect(result.metadata).toEqual({
      model: "gemini-3.5-flash-lite",
      fallback: true,
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent`,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    ]);
  });

  it("falls back to the next text model after HTTP 404", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "model retired" } }), { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(buildSuccessBody("fallback response")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await new GoogleGeminiAdapter().completeText({
      prompt: "hello",
    });

    expect(result.metadata).toEqual({
      model: "gemini-3.5-flash-lite",
      fallback: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the next vision model after HTTP 429", async () => {
    const critique = {
      score: 0.9,
      feedback: "Good",
      issues: [],
    };
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "quota" } }), {
          status: 429,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(buildSuccessBody(JSON.stringify(critique))),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await new GoogleGeminiAdapter().scoreImage({
      artifactId: "art-1",
      rubric: "Score image",
      imageBase64: MOCK_PNG_BASE64,
    });

    expect(result.score).toBe(0.9);
    expect(result.metadata).toEqual({
      model: "gemini-3.5-flash-lite",
      fallback: true,
    });
  });

  it("does not fall back after HTTP 400", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad request" } }), {
        status: 400,
      }),
    );

    const error = await captureRejection(
      new GoogleGeminiAdapter().completeText({ prompt: "hello" }),
      "bad request",
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  // --- HTTP 503 retry / model-chain behaviour ---

  it("retries the same model 3 times on HTTP 503, then succeeds on the 4th call", async () => {
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "The model is experiencing high demand" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "The model is experiencing high demand" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "The model is experiencing high demand" } }), { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(buildSuccessBody("recovered")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const adapter = new GoogleGeminiAdapter({ sleep: sleepMock });
    const result = await adapter.completeText({ prompt: "hello" });

    expect(result.text).toBe("recovered");
    expect(result.metadata).toEqual({ model: TEXT_MODEL });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls.map(([url]) => url),
    ).toEqual(Array(4).fill(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent`));
    expect(sleepMock.mock.calls.map(([ms]) => ms)).toEqual([
      1000, 2000, 4000,
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy.mock.calls[0][0]).toContain("retrying in 1000ms");
    warnSpy.mockRestore();
  });

  it("advances to the next model after 3 failed HTTP 503 retries", async () => {
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(buildSuccessBody("second model")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const adapter = new GoogleGeminiAdapter({ sleep: sleepMock });
    const result = await adapter.completeText({ prompt: "hello" });

    expect(result.text).toBe("second model");
    expect(result.metadata).toEqual({
      model: "gemini-3.5-flash-lite",
      fallback: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(sleepMock).toHaveBeenCalledTimes(3);
    vi.restoreAllMocks();
  });

  it("throws ProviderRateLimitError when every model exhausts its HTTP 503 retries", async () => {
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { message: "high demand" } }),
          { status: 503 },
        ),
      ),
    );

    const adapter = new GoogleGeminiAdapter({ sleep: sleepMock });
    const error = await captureRejection(
      adapter.completeText({ prompt: "hello" }),
      "503-exhausted call",
    );

    expect(error).toBeInstanceOf(ProviderRateLimitError);
    expect((error as Error).message).toContain("503");
    // 3 models x (1 initial + 3 retries) = 12 calls, 9 retries with sleep.
    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(sleepMock).toHaveBeenCalledTimes(9);
    vi.restoreAllMocks();
  });

  it("500 exhausts every model, preserving the last error message", async () => {
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Fresh Response per call: a Response body can only be read once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: "Internal server error occurred",
              code: "internal",
            },
          }),
          { status: 500 },
        ),
      ),
    );

    const adapter = new GoogleGeminiAdapter({ sleep: sleepMock });
    const error = await captureRejection(
      adapter.completeText({ prompt: "Hello" }),
      "server error call",
    );

    expect(error).toBeInstanceOf(ProviderRateLimitError);
    expect((error as Error).message).toContain(
      "Internal server error occurred",
    );
    expect(fetchMock).toHaveBeenCalledTimes(12);
    vi.restoreAllMocks();
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
