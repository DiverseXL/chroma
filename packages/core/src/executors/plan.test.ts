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
    expect(graph.metadata).toMatchObject({
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
    expect(
      graph.nodes.filter((node) => node.kind === "PROMPT_COMPILE")
        .every((node) => node.label.startsWith("Prompt: ")),
    ).toBe(true);
    expect(
      (graph.metadata?.scenes as Array<{ prompt: string }>).every((scene) =>
        scene.prompt.includes("digital illustration"),
      ),
    ).toBe(true);
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

    expect(graph.metadata).toMatchObject({
      fallback: true,
      reason: "planner_rate_limited",
    });
    expect(() => compileGraph(graph)).not.toThrow();
  });
});

describe("executePlan Story Bible pipeline", () => {
  it("builds descriptive panel nodes and prompts from per-panel scene plans", async () => {
    const bible = {
      panelCount: 2,
      characters: [
        {
          name: "Mara",
          description: "A stranded astronaut searching for a way home",
          appearance: "White EVA suit dusted with blue forest spores",
        },
      ],
      locations: [
        {
          name: "Bioluminescent forest",
          description: "Ancient trees threaded with glowing vines",
          timeOfDay: "dusk",
          atmosphere: "Mysterious and quietly alive",
        },
      ],
      visualStyle: {
        palette: "deep teal, midnight blue, and luminous cyan",
        lighting: "soft dusk rim light and glowing plants",
        mood: "wonder mixed with isolation",
        medium: "cinematic science-fiction illustration",
        era: "near future",
      },
      overallArc: "Mara emerges from the wreck and discovers the forest responding to her.",
    };
    const scenePlans = [
      {
        panelIndex: 1,
        sceneDescription: "Mara climbs out of her crashed pod into the forest.",
        subject: "Astronaut emerging from the pod",
        action: "climbs through the open hatch into the glowing forest",
        cameraAngle: "wide establishing shot",
        prompt:
          "A lone astronaut climbs through the open hatch of a battered escape pod into a bioluminescent forest at dusk, deep teal and midnight blue palette, soft cyan plant glow, cinematic science-fiction illustration, wide establishing shot.",
      },
      {
        panelIndex: 2,
        sceneDescription: "Mara follows glowing tracks between the ancient trees.",
        subject: "Astronaut following glowing tracks",
        action: "follows luminous tracks between enormous trees",
        cameraAngle: "medium tracking shot",
        prompt:
          "A lone astronaut follows luminous tracks between enormous ancient trees, her white EVA suit catching cyan reflections, deep teal and midnight blue palette, soft dusk rim lighting, cinematic science-fiction illustration, medium tracking shot.",
      },
    ];
    const completeText = vi
      .fn()
      .mockResolvedValueOnce({ text: JSON.stringify(bible), parsed: bible })
      .mockResolvedValueOnce({
        text: JSON.stringify(scenePlans[0]),
        parsed: scenePlans[0],
      })
      .mockResolvedValueOnce({
        text: JSON.stringify(scenePlans[1]),
        parsed: scenePlans[1],
      });
    const context = {
      providers: { text: { completeText } },
    } as unknown as ExecutionContext;

    const graph = await executePlan(
      "A two-panel astronaut story in a bioluminescent forest",
      context,
    );
    const compiled = compileGraph(graph);
    const prompts = compiled.nodes.filter(
      (node) => node.kind === "PROMPT_COMPILE",
    );
    const generatedImages = compiled.nodes.filter(
      (node) => node.kind === "IMAGE_GENERATE",
    );
    const critiques = compiled.nodes.filter(
      (node) => node.kind === "CRITIQUE",
    );

    expect(completeText).toHaveBeenCalledTimes(3);
    expect(prompts.map((node) => node.label)).toEqual([
      "Prompt: Astronaut emerging from the",
      "Prompt: Astronaut following glowing tracks",
    ]);
    expect(generatedImages.map((node) => node.label)).toEqual([
      "Image: Astronaut emerging from the",
      "Image: Astronaut following glowing tracks",
    ]);
    expect(critiques.map((node) => node.label)).toEqual([
      "Critique: Astronaut emerging from the",
      "Critique: Astronaut following glowing tracks",
    ]);
    expect(graph.metadata?.scenes).toEqual(scenePlans);
    expect(completeText.mock.calls[1][0].system).toContain(
      "The overall arc is: Mara emerges from the wreck and discovers the forest responding to her.",
    );
    expect(completeText.mock.calls[1][0].system).toMatch(
      /You are planning panel 1 of\s+2 panels/,
    );
    expect(completeText.mock.calls[2][0].system).toMatch(
      /Panels already\s+planned:\s+Panel 1: Mara climbs out of her crashed pod into the forest\./,
    );
    expect(completeText.mock.calls[2][0].system).toMatch(
      /Your panel must depict the NEXT distinct moment in\s+the arc/,
    );
    for (const scene of graph.metadata?.scenes as typeof scenePlans) {
      expect(scene.prompt).not.toBe("Panel 1");
      expect(scene.prompt.trim()).not.toBe("");
      expect(scene.prompt.split(/\s+/).length).toBeGreaterThanOrEqual(25);
    }
    expect(graph.nodes.find((node) => node.kind === "STYLE_ANALYSIS")?.inputs)
      .toEqual({ storyBible: "plan.storyBible" });
  });
});
