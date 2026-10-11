import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "./types.js";
import { compileGraph } from "../graph/compiler.js";
import { ProviderRateLimitError } from "../provider/adapter.js";
import { executePlan } from "./plan.js";

describe("executePlan rate-limit fallback", () => {
  it("returns a validated two-panel graph with fallback metadata", async () => {
    const completeText = vi
      .fn()
      .mockRejectedValue(
        new ProviderRateLimitError("Google API rate limited the request (HTTP 429)"),
      );
    const context = {
      providers: {
        text: { completeText },
      },
    } as unknown as ExecutionContext;

    const graph = await executePlan("A two-panel storyboard", context);

    expect(completeText).toHaveBeenCalledTimes(1);
    expect(graph.metadata).toEqual({
      fallback: true,
      reason: "planner_rate_limited",
    });
    expect(graph.nodes.filter((node) => node.kind === "PLAN")).toHaveLength(1);
    expect(graph.nodes.filter((node) => node.kind === "STYLE_ANALYSIS")).toHaveLength(1);
    for (const kind of [
      "PROMPT_COMPILE",
      "IMAGE_GENERATE",
      "CRITIQUE",
      "GATE",
    ]) {
      expect(graph.nodes.filter((node) => node.kind === kind)).toHaveLength(2);
    }
    expect(graph.nodes.filter((node) => node.kind === "COMPOSE")).toHaveLength(1);
    expect(() => compileGraph(graph)).not.toThrow();
  });

  it("returns the fallback graph for a cross-realm rate-limit error (name/code match)", async () => {
    // In the Next server runtime @chroma/core is loaded through two module
    // graphs, so `instanceof ProviderRateLimitError` can be false even for a
    // real rate-limit error. The structural shape must still engage the
    // fallback.
    const imposter = Object.assign(
      new Error(
        "Google API models exhausted without a successful response (last error: HTTP 503)",
      ),
      { name: "ProviderRateLimitError", code: "rate_limit" },
    );
    const completeText = vi.fn().mockRejectedValue(imposter);
    const context = {
      providers: {
        text: { completeText },
      },
    } as unknown as ExecutionContext;

    const graph = await executePlan("A two-panel storyboard", context);

    expect(graph.metadata).toEqual({
      fallback: true,
      reason: "planner_rate_limited",
    });
    expect(() => compileGraph(graph)).not.toThrow();
  });
});
