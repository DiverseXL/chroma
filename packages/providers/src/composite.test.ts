import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProviderError,
  type CritiqueResult,
  type ImageArtifactResult,
  type ProviderAdapter,
} from "@chroma/core";
import { CompositeImageAdapter } from "./composite.js";

const IMAGE: ImageArtifactResult = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/png",
  width: 512,
  height: 512,
};

const CRITIQUE: CritiqueResult = { score: 8, feedback: "good", issues: [] };

/**
 * Builds a ProviderAdapter whose methods are all vi.fn()s with sane defaults.
 *
 * @param overrides Replacements for individual methods.
 * @returns The stubbed adapter.
 */
function stubAdapter(
  overrides: Partial<Record<keyof ProviderAdapter, unknown>> = {},
): ProviderAdapter {
  return {
    generateImage: vi.fn().mockResolvedValue(IMAGE),
    editImage: vi.fn().mockResolvedValue(IMAGE),
    scoreImage: vi.fn().mockResolvedValue(CRITIQUE),
    completeText: vi.fn().mockResolvedValue({ text: "ok" }),
    ...overrides,
  } as ProviderAdapter;
}

describe("CompositeImageAdapter", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the primary result without touching the fallback", async () => {
    const primary = stubAdapter();
    const fallback = stubAdapter();
    const composite = new CompositeImageAdapter(primary, fallback);

    const result = await composite.generateImage({ prompt: "a red fox" });

    expect(result).toBe(IMAGE);
    expect(primary.generateImage).toHaveBeenCalledTimes(1);
    expect(fallback.generateImage).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("falls back when the primary throws a ProviderError", async () => {
    const primary = stubAdapter({
      generateImage: vi
        .fn()
        .mockRejectedValue(new ProviderError("worker unreachable", { code: "network" })),
    });
    const fallback = stubAdapter();
    const composite = new CompositeImageAdapter(primary, fallback);

    const result = await composite.generateImage({ prompt: "a red fox" });

    expect(result).toBe(IMAGE);
    expect(fallback.generateImage).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("worker unreachable"),
    );
  });

  it("throws the fallback error when both adapters fail", async () => {
    const primary = stubAdapter({
      generateImage: vi
        .fn()
        .mockRejectedValue(new ProviderError("primary down")),
    });
    const fallback = stubAdapter({
      generateImage: vi
        .fn()
        .mockRejectedValue(new ProviderError("fallback down", { code: "insufficient_credits" })),
    });
    const composite = new CompositeImageAdapter(primary, fallback);

    const error = await composite
      .generateImage({ prompt: "a red fox" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("insufficient_credits");
    expect((error as Error).message).toContain("fallback down");
  });

  it("rethrows non-ProviderError failures without touching the fallback", async () => {
    const bug = new TypeError("adapter bug");
    const primary = stubAdapter({
      generateImage: vi.fn().mockRejectedValue(bug),
    });
    const fallback = stubAdapter();
    const composite = new CompositeImageAdapter(primary, fallback);

    const error = await composite
      .generateImage({ prompt: "a red fox" })
      .catch((caught: unknown) => caught);

    expect(error).toBe(bug);
    expect(fallback.generateImage).not.toHaveBeenCalled();
  });

  it("delegates editImage, scoreImage, and completeText to the primary only", async () => {
    const primary = stubAdapter();
    const fallback = stubAdapter();
    const composite = new CompositeImageAdapter(primary, fallback);

    await composite.editImage({ sourceArtifactId: "a", instruction: "warm it" });
    await composite.scoreImage({ artifactId: "a", rubric: "sharpness" });
    await composite.completeText({ prompt: "hi" });

    expect(primary.editImage).toHaveBeenCalledTimes(1);
    expect(primary.scoreImage).toHaveBeenCalledTimes(1);
    expect(primary.completeText).toHaveBeenCalledTimes(1);
    expect(fallback.editImage).not.toHaveBeenCalled();
    expect(fallback.scoreImage).not.toHaveBeenCalled();
    expect(fallback.completeText).not.toHaveBeenCalled();
  });
});
