import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError, ProviderRateLimitError } from "@chroma/core";
import { KIEAdapter, KIE_DEFAULT_MODEL } from "./kie.js";

const API_KEY = "test-kie-key";

/** PNG signature bytes, so assertions compare plausibly-image payloads. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** JPEG signature bytes (FF D8 FF), so sniffing has something to detect. */
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const originalApiKey = process.env.KIE_API_KEY;
const originalBaseUrl = process.env.KIE_BASE_URL;
const originalModel = process.env.KIE_MODEL;

/**
 * Builds a JSON Response shaped like a KIE body (HTTP 200 + code field).
 *
 * @param body The KIE response body.
 * @returns A Response carrying the body as JSON.
 */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Builds the successful createTask body.
 *
 * @param taskId The task id KIE should report.
 * @returns A Response for the createTask call.
 */
function createOk(taskId = "task-1"): Response {
  return jsonResponse({ code: 200, msg: "success", data: { taskId } });
}

/**
 * Builds a successful recordInfo body.
 *
 * @param credits Credits consumed by the task.
 * @param url The first result URL.
 * @returns A Response for the recordInfo call.
 */
function recordSuccess(credits = 8, url = "https://tempfile.kie.ai/out.png"): Response {
  return jsonResponse({
    code: 200,
    msg: "success",
    data: {
      state: "success",
      creditsConsumed: credits,
      resultJson: JSON.stringify({ resultUrls: [url] }),
    },
  });
}

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

describe("KIEAdapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.KIE_API_KEY = API_KEY;
    delete process.env.KIE_BASE_URL;
    delete process.env.KIE_MODEL;
    fetchMock.mockReset();
    // No real network access: every request goes through the mock.
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();

    if (originalApiKey === undefined) {
      delete process.env.KIE_API_KEY;
    } else {
      process.env.KIE_API_KEY = originalApiKey;
    }
    if (originalBaseUrl === undefined) {
      delete process.env.KIE_BASE_URL;
    } else {
      process.env.KIE_BASE_URL = originalBaseUrl;
    }
    if (originalModel === undefined) {
      delete process.env.KIE_MODEL;
    } else {
      process.env.KIE_MODEL = originalModel;
    }
  });

  it("creates a task, polls to success, and returns the downloaded image", async () => {
    fetchMock
      .mockResolvedValueOnce(createOk())
      .mockResolvedValueOnce(recordSuccess())
      .mockResolvedValueOnce(
        new Response(PNG_BYTES, { status: 200 }),
      );

    const adapter = new KIEAdapter();
    const result = await adapter.generateImage({
      prompt: "a red fox in the snow",
      width: 768,
      height: 512,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [createUrl, createInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(new URL(createUrl).pathname).toBe("/api/v1/jobs/createTask");
    expect(createInit.method).toBe("POST");
    expect(createInit.headers).toEqual({
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(createInit.body))).toEqual({
      model: KIE_DEFAULT_MODEL,
      input: {
        prompt: "a red fox in the snow",
        aspect_ratio: "16:9",
        resolution: "1K",
      },
    });

    const [pollUrl, pollInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    const pollTarget = new URL(pollUrl);
    expect(`${pollTarget.pathname}${pollTarget.search}`).toBe(
      "/api/v1/jobs/recordInfo?taskId=task-1",
    );
    expect(pollInit.headers).toEqual({
      Authorization: `Bearer ${API_KEY}`,
    });

    const [downloadUrl] = fetchMock.mock.calls[2] as [string];
    expect(downloadUrl).toBe("https://tempfile.kie.ai/out.png");

    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(768);
    expect(result.height).toBe(512);
    expect(Array.from(result.bytes)).toEqual(Array.from(PNG_BYTES));
    expect(result.metadata).toEqual({
      provider: "kie",
      model: KIE_DEFAULT_MODEL,
      creditsConsumed: 8,
    });
  });

  it("throws an unauthorized ProviderError when createTask returns body code 401", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 401, msg: "Unauthorized: invalid api key", data: null }),
    );

    const adapter = new KIEAdapter();
    const error = await captureRejection(
      adapter.generateImage({ prompt: "a red fox" }),
      "generateImage",
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("unauthorized");
    expect((error as ProviderError).message).toContain(
      "Unauthorized: invalid api key",
    );
  });

  it("throws an insufficient_credits ProviderError when createTask returns body code 402", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 402, msg: "Insufficient credits", data: null }),
    );

    const adapter = new KIEAdapter();
    const error = await captureRejection(
      adapter.generateImage({ prompt: "a red fox" }),
      "generateImage",
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("insufficient_credits");
    expect((error as ProviderError).message).toContain("Insufficient credits");
  });

  it("throws a ProviderRateLimitError when KIE reports body code 429", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 429, msg: "too many requests", data: null }),
    );

    const adapter = new KIEAdapter();
    const error = await captureRejection(
      adapter.generateImage({ prompt: "a red fox" }),
      "generateImage",
    );

    expect(error).toBeInstanceOf(ProviderRateLimitError);
    expect((error as Error).message).toContain("too many requests");
  });

  it("throws a ProviderError with the failMsg when the task fails", async () => {
    fetchMock
      .mockResolvedValueOnce(createOk())
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          msg: "success",
          data: {
            state: "fail",
            failCode: "500",
            failMsg: "content policy violation",
          },
        }),
      );

    const adapter = new KIEAdapter();
    const error = await captureRejection(
      adapter.generateImage({ prompt: "a red fox" }),
      "generateImage",
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("kie_task_failed");
    expect((error as Error).message).toContain("content policy violation");
    expect((error as Error).message).toContain("500");
  });

  it("throws a kie_timeout ProviderError when the task never settles within 180s", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(createOk())
      .mockImplementation(() =>
        // Fresh Response per poll: a Response body can only be read once.
        Promise.resolve(
          jsonResponse({
            code: 200,
            msg: "success",
            data: { state: "generating" },
          }),
        ),
      );

    const adapter = new KIEAdapter();
    const promise = adapter.generateImage({ prompt: "a red fox" });
    const assertion = expect(promise).rejects.toMatchObject({
      code: "kie_timeout",
    });
    await vi.advanceTimersByTimeAsync(200_000);
    await assertion;
  });

  it("detects JPEG magic bytes and reports image/jpeg", async () => {
    fetchMock
      .mockResolvedValueOnce(createOk())
      .mockResolvedValueOnce(recordSuccess(8, "https://tempfile.kie.ai/out.jpg"))
      .mockResolvedValueOnce(new Response(JPEG_BYTES, { status: 200 }));

    const adapter = new KIEAdapter();
    const result = await adapter.generateImage({ prompt: "a red fox" });

    expect(result.mimeType).toBe("image/jpeg");
    expect(Array.from(result.bytes)).toEqual(Array.from(JPEG_BYTES));
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it("throws a network-coded ProviderError when the image download rejects", async () => {
    fetchMock
      .mockResolvedValueOnce(createOk())
      .mockResolvedValueOnce(recordSuccess())
      .mockRejectedValueOnce(new TypeError("fetch failed"));

    const adapter = new KIEAdapter();
    const error = await captureRejection(
      adapter.generateImage({ prompt: "a red fox" }),
      "generateImage",
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("network");
    expect((error as Error).message).toContain("fetch failed");
    expect((error as Error).cause).toBeInstanceOf(TypeError);
  });

  it.each([
    [1024, 1024, "1:1"],
    [1280, 720, "16:9"],
    [720, 1280, "9:16"],
    [undefined, undefined, "1:1"],
  ])(
    "derives aspect_ratio %s from %sx%s dimensions",
    async (width, height, expected) => {
      fetchMock
        .mockResolvedValueOnce(createOk())
        .mockResolvedValueOnce(recordSuccess())
        .mockResolvedValueOnce(new Response(PNG_BYTES, { status: 200 }));

      const adapter = new KIEAdapter();
      await adapter.generateImage({ prompt: "a red fox", width, height });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(new URL(url).pathname).toBe("/api/v1/jobs/createTask");
      const body = JSON.parse(String(init.body)) as {
        input: { aspect_ratio: string; resolution: string };
      };
      expect(body.input.aspect_ratio).toBe(expected);
      expect(body.input.resolution).toBe("1K");
    },
  );
});
