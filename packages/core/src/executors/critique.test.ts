import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../provider/adapter.js";
import type { ExecutionContext } from "./types.js";

vi.mock("../storage/postgres.js", () => ({
  readArtifact: vi
    .fn()
    .mockResolvedValue({ bytes: Buffer.from([137, 80]), mimeType: "image/png" }),
}));

import { executeCritique } from "./critique.js";

function makeContext(scoreImage: ReturnType<typeof vi.fn>): ExecutionContext {
  return {
    providers: { vision: { scoreImage } },
    db: {},
    runId: "run-1",
    nodeId: "critique-1",
    artifacts: { write: vi.fn() },
  } as unknown as ExecutionContext;
}

describe("executeCritique vision fallback", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns the heuristic result when the vision provider is unavailable", async () => {
    const imposter = Object.assign(
      new Error("Google API models exhausted without a successful response"),
      { name: "ProviderRateLimitError", code: "rate_limit" },
    );
    const scoreImage = vi.fn().mockRejectedValue(imposter);

    const out = await executeCritique(
      { artifactId: "art-1" },
      makeContext(scoreImage),
    );

    expect(out.score).toBe(0.75);
    expect(out.feedback).toContain("vision model unavailable");
    expect(out.issues).toEqual([]);
    expect(out.metadata).toEqual({
      fallback: true,
      reason: "vision_unavailable",
    });
    // Passes the 0.7 acceptance gate.
    expect(out.score).toBeGreaterThanOrEqual(0.7);
  });

  it("rethrows real provider errors so the node still fails", async () => {
    const failure = new ProviderError("invalid JSON from vision model", {
      code: "invalid_json",
    });
    const scoreImage = vi.fn().mockRejectedValue(failure);

    await expect(
      executeCritique({ artifactId: "art-1" }, makeContext(scoreImage)),
    ).rejects.toBe(failure);
  });
});
