import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProviderContentFilterError,
  ProviderError,
  ProviderRateLimitError,
} from "@chroma/core";
import {
  CLOUDFLARE_IMAGE_MODEL,
  CloudflareWorkersAIAdapter,
} from "./cloudflare.js";

const WORKER_URL = "https://chroma-image-api.example.workers.dev";
const API_KEY = "test-api-key";

/** PNG signature bytes, so assertions compare plausibly-image payloads. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const originalWorkerUrl = process.env.CF_WORKER_URL;
const originalApiKey = process.env.CF_API_KEY;

/**
 * Awaits a promise that is expected to reject and returns the rejection reason.
 *
 * @param promise The promise expected to reject.
 * @param label Description used in the failure message.
 * @returns The caught rejection reason.
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

describe("CloudflareWorkersAIAdapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.CF_WORKER_URL = WORKER_URL;
    process.env.CF_API_KEY = API_KEY;
    fetchMock.mockReset();
    // No real network access: every request goes through the mock.
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    if (originalWorkerUrl === undefined) {
      delete process.env.CF_WORKER_URL;
    } else {
      process.env.CF_WORKER_URL = originalWorkerUrl;
    }

    if (originalApiKey === undefined) {
      delete process.env.CF_API_KEY;
    } else {
      process.env.CF_API_KEY = originalApiKey;
    }
  });

  it("returns the worker PNG bytes and the requested dimensions", async () => {
    fetchMock.mockResolvedValue(
      new Response(PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const adapter = new CloudflareWorkersAIAdapter();
    const result = await adapter.generateImage({
      prompt: "a red fox in the snow",
      width: 768,
      height: 512,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WORKER_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    });
    expect(init.body).toBe(
      JSON.stringify({ prompt: "a red fox in the snow" }),
    );

    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(768);
    expect(result.height).toBe(512);
    expect(Array.from(result.bytes)).toEqual(Array.from(PNG_BYTES));
    expect(result.metadata).toEqual({
      provider: "cloudflare",
      model: CLOUDFLARE_IMAGE_MODEL,
    });
  });

  it("throws an unauthorized ProviderError on HTTP 401", async () => {
    fetchMock.mockResolvedValue(
      new Response("invalid api key", { status: 401 }),
    );

    const adapter = new CloudflareWorkersAIAdapter();
    const error = await captureRejection(
      adapter.generateImage({ prompt: "a red fox" }),
      "generateImage",
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).not.toBeInstanceOf(ProviderRateLimitError);
    expect((error as ProviderError).code).toBe("unauthorized");
    expect((error as ProviderError).message).toContain("401");
  });

  it("throws a ProviderRateLimitError on HTTP 429", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "too many requests" }), {
        status: 429,
      }),
    );

    const adapter = new CloudflareWorkersAIAdapter();
    const error = await captureRejection(
      adapter.generateImage({ prompt: "a red fox" }),
      "generateImage",
    );

    expect(error).toBeInstanceOf(ProviderRateLimitError);
    expect((error as Error).message).toContain("429");
  });

  it("throws a ProviderContentFilterError when the body reports NSFW content", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "NSFW content detected by safety filter" }),
        { status: 500 },
      ),
    );

    const adapter = new CloudflareWorkersAIAdapter();
    const error = await captureRejection(
      adapter.generateImage({ prompt: "an unsafe prompt" }),
      "generateImage",
    );

    expect(error).toBeInstanceOf(ProviderContentFilterError);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as Error).message).toContain("500");
    expect((error as Error).message).toContain("NSFW content");
  });

  it("throws a network-coded ProviderError when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const adapter = new CloudflareWorkersAIAdapter();
    const error = await captureRejection(
      adapter.generateImage({ prompt: "a red fox" }),
      "generateImage",
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("network");
    expect((error as Error).message).toContain("fetch failed");
    expect((error as Error).cause).toBeInstanceOf(TypeError);
  });
});
