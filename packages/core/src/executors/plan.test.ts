import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "./types.js";
import { compileGraph } from "../graph/compiler.js";
import { ProviderRateLimitError } from "../provider/adapter.js";
import { executePlan, MOTION_VERBS } from "./plan.js";

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

describe("executePlan planner budget", () => {
  it("falls back to the deterministic storyboard when the planner exceeds its 90s budget", async () => {
    vi.useFakeTimers();
    try {
      // The text provider never settles: no rejection, no resolution.
      const completeText = vi.fn(() => new Promise<never>(() => {}));
      const context = {
        providers: { text: { completeText } },
      } as unknown as ExecutionContext;

      const pending = executePlan("A two-panel storyboard", context);
      const expectation = expect(pending).resolves.toMatchObject({
        metadata: { fallback: true, reason: "planner_timeout" },
      });

      // The planner races a 90_000ms budget; advancing fake time past it
      // must produce the deterministic fallback graph, not a hung run.
      await vi.advanceTimersByTimeAsync(90_000);
      await expectation;

      const graph = await pending;
      expect(completeText).toHaveBeenCalledTimes(1);
      expect(graph.nodes.filter((node) => node.kind === "PLAN")).toHaveLength(1);
      expect(() => compileGraph(graph)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

const ASTRONAUT_BIBLE = {
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

const ASTRONAUT_BEATS = {
  beats: [
    {
      index: 1,
      description: "Mara climbs out of her crashed pod into the forest.",
      actionVerb: "climbing",
      subject: "Astronaut emerging from the pod",
      stage: "action",
    },
    {
      index: 2,
      description: "Mara follows glowing tracks between the ancient trees.",
      actionVerb: "walking",
      subject: "Astronaut following glowing tracks",
      stage: "action",
    },
  ],
};

const ASTRONAUT_PROMPT_1 =
  "The astronaut is climbing through the open hatch of a battered escape " +
  "pod into a bioluminescent forest at dusk, one boot on the mossy ground, " +
  "body leaning forward, deep teal and midnight blue palette, soft cyan " +
  "plant glow, cinematic science-fiction illustration, wide establishing " +
  "shot framing the wreck.";

const ASTRONAUT_PROMPT_2 =
  "The astronaut is walking between enormous ancient trees while following " +
  "luminous tracks that glow underfoot, white EVA suit catching cyan " +
  "reflections, deep teal and midnight blue palette, soft dusk rim " +
  "lighting, cinematic science-fiction illustration, medium tracking shot, " +
  "long stride showing steady motion.";

describe("executePlan two-stage scene planner", () => {
  it("extracts beats then writes one prompt per panel from those beats", async () => {
    const completeText = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify(ASTRONAUT_BIBLE),
        parsed: ASTRONAUT_BIBLE,
      })
      .mockResolvedValueOnce({
        text: JSON.stringify(ASTRONAUT_BEATS),
        parsed: ASTRONAUT_BEATS,
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ prompt: ASTRONAUT_PROMPT_1 }),
        parsed: { prompt: ASTRONAUT_PROMPT_1 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ prompt: ASTRONAUT_PROMPT_2 }),
        parsed: { prompt: ASTRONAUT_PROMPT_2 },
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

    expect(completeText).toHaveBeenCalledTimes(4);

    // Call A — Story Beat Extractor receives the brief and panel count.
    expect(completeText.mock.calls[1][0].system).toContain(
      "Story Beat Extractor",
    );
    expect(completeText.mock.calls[1][0].prompt).toContain("exactly 2 panels");
    expect(completeText.mock.calls[1][0].prompt).toContain(
      "A two-panel astronaut story in a bioluminescent forest",
    );

    // Call B — Panel Prompt Writer, one call per panel, with beat + style.
    expect(completeText.mock.calls[2][0].system).toMatch(
      /Write a single detailed image generation prompt for panel 1/,
    );
    expect(completeText.mock.calls[3][0].system).toMatch(
      /Write a single detailed image generation prompt for panel 2/,
    );
    expect(completeText.mock.calls[2][0].prompt).toContain(
      "Mara climbs out of her crashed pod into the forest.",
    );
    expect(completeText.mock.calls[2][0].prompt).toContain(
      "Mara follows glowing tracks between the ancient trees.",
    );
    expect(completeText.mock.calls[2][0].prompt).toContain(
      "deep teal, midnight blue, and luminous cyan",
    );

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
    expect(graph.metadata?.scenes).toEqual([
      {
        panelIndex: 1,
        sceneDescription: "Mara climbs out of her crashed pod into the forest.",
        subject: "Astronaut emerging from the pod",
        action: "the Astronaut emerging from the pod is climbing",
        cameraAngle: "dynamic action shot",
        prompt: ASTRONAUT_PROMPT_1,
      },
      {
        panelIndex: 2,
        sceneDescription: "Mara follows glowing tracks between the ancient trees.",
        subject: "Astronaut following glowing tracks",
        action: "the Astronaut following glowing tracks is walking",
        cameraAngle: "dynamic action shot",
        prompt: ASTRONAUT_PROMPT_2,
      },
    ]);
    for (const scene of graph.metadata?.scenes as Array<{ prompt: string }>) {
      expect(scene.prompt.trim()).not.toBe("");
      expect(scene.prompt.split(/\s+/).length).toBeGreaterThanOrEqual(30);
    }
    expect(graph.nodes.find((node) => node.kind === "STYLE_ANALYSIS")?.inputs)
      .toEqual({ storyBible: "plan.storyBible" });
  });

  it("keeps Call B valid only when the prompt carries the beat's action verb", async () => {
    const bible = {
      panelCount: 1,
      characters: [],
      locations: [],
      visualStyle: {
        palette: "amber and crimson",
        lighting: "golden hour",
        mood: "quiet anticipation",
        medium: "painterly digital illustration",
        era: "contemporary",
      },
      overallArc: "An apple hangs, then falls.",
    };
    const beats = {
      beats: [
        {
          index: 1,
          description: "A single apple detaching from a branch and falling",
          actionVerb: "falling",
          subject: "apple",
          stage: "action",
        },
      ],
    };
    // Valid length and no forbidden words, but zero motion verbs: this must
    // trigger exactly one rewrite request.
    const setupOnlyPrompt =
      "A single red apple rests attached to a twig amid green leaves on a " +
      "mature fruit tree, warm amber light bathing its glossy skin, orchard " +
      "rows receding softly out of focus behind it, harvest time, perfectly " +
      "still air, a quiet golden afternoon.";
    const rewrittenPrompt =
      "A single apple detached from the branch, falling fast through the " +
      "golden air, motion blur along its red skin, leaves blurred behind, " +
      "gravity dragging it downward mid-fall, orchard canopy shrinking " +
      "above, dynamic action shot capturing the plunge.";

    const completeText = vi
      .fn()
      .mockResolvedValueOnce({ text: JSON.stringify(bible), parsed: bible })
      .mockResolvedValueOnce({ text: JSON.stringify(beats), parsed: beats })
      .mockResolvedValueOnce({
        text: JSON.stringify({ prompt: setupOnlyPrompt }),
        parsed: { prompt: setupOnlyPrompt },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ prompt: rewrittenPrompt }),
        parsed: { prompt: rewrittenPrompt },
      });
    const context = {
      providers: { text: { completeText } },
    } as unknown as ExecutionContext;

    const graph = await executePlan("An apple falling", context);

    expect(completeText).toHaveBeenCalledTimes(4);
    expect(completeText.mock.calls[3][0].prompt).toContain(
      "Your previous prompt did not contain the action verb 'falling'. The panel must depict the action, not the setup. Rewrite it.",
    );
    const scenes = graph.metadata?.scenes as Array<{ prompt: string }>;
    expect(scenes).toHaveLength(1);
    expect(scenes[0].prompt).toContain("falling");
    expect(() => compileGraph(graph)).not.toThrow();
  });
});

describe("executePlan apple brief (beat descriptors reach each panel)", () => {
  it("gives panel 1 a tree and panel 2 a falling apple with a motion verb", async () => {
    const bible = {
      panelCount: 2,
      characters: [],
      locations: [
        {
          name: "Autumn orchard",
          description: "Rows of apple trees under a low sun",
          timeOfDay: "golden hour",
          atmosphere: "warm and still",
        },
      ],
      visualStyle: {
        palette: "amber, crimson, and moss green",
        lighting: "golden hour rim light",
        mood: "serene anticipation",
        medium: "painterly digital illustration",
        era: "contemporary",
      },
      overallArc: "A full apple tree stands in the orchard, then one apple falls.",
    };
    const beats = {
      beats: [
        {
          index: 1,
          description: "A full apple tree in an autumn orchard",
          actionVerb: null,
          subject: "apple tree",
          stage: "setup",
        },
        {
          index: 2,
          description: "A single apple detaching from a branch and falling",
          actionVerb: "falling",
          subject: "apple",
          stage: "action",
        },
      ],
    };
    const panel1Prompt =
      "A full apple tree stands alone in an autumn orchard at golden hour, " +
      "its branches heavy with ripe red fruit, fallen leaves carpeting the " +
      "grass below, warm low sunlight raking across the orchard rows, long " +
      "soft shadows, wide establishing shot showing the entire tree from " +
      "ground to crown.";
    const panel2Prompt =
      "A single apple detached from its branch and falling through the " +
      "golden air, motion blur trailing its red skin, leaves and twigs left " +
      "behind above, orchard canopy out of focus in the background, gravity " +
      "pulling it downward mid-fall, dynamic action shot freezing the drop.";

    const completeText = vi
      .fn()
      .mockResolvedValueOnce({ text: JSON.stringify(bible), parsed: bible })
      .mockResolvedValueOnce({ text: JSON.stringify(beats), parsed: beats })
      .mockResolvedValueOnce({
        text: JSON.stringify({ prompt: panel1Prompt }),
        parsed: { prompt: panel1Prompt },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ prompt: panel2Prompt }),
        parsed: { prompt: panel2Prompt },
      });
    const context = {
      providers: { text: { completeText } },
    } as unknown as ExecutionContext;

    const graph = await executePlan(
      "a picture of an apple tree and next an apple falling",
      context,
    );
    const compiled = compileGraph(graph);
    const promptNodes = compiled.nodes.filter(
      (node) => node.kind === "PROMPT_COMPILE",
    );
    expect(promptNodes).toHaveLength(2);
    expect(completeText).toHaveBeenCalledTimes(4);

    const scenes = graph.metadata?.scenes as Array<{
      panelIndex: number;
      prompt: string;
    }>;
    const sceneForNode = (node: { inputs: Record<string, string> }) => {
      const ref = String(node.inputs.scenePlan);
      const port = ref.slice(ref.lastIndexOf(".") + 1);
      const panelIndex = Number(port.replace(/^scene_/, ""));
      return scenes.find((scene) => scene.panelIndex === panelIndex);
    };

    const scene1 = sceneForNode(promptNodes[0]);
    const scene2 = sceneForNode(promptNodes[1]);
    expect(scene1).toBeDefined();
    expect(scene2).toBeDefined();

    // Panel 1: the setup beat — a full apple tree in an orchard.
    expect(scene1!.prompt).toContain("apple tree");
    expect(scene1!.prompt).toContain("orchard");

    // Panel 2: the action beat — an apple actually falling.
    expect(scene2!.prompt).toMatch(/falling|mid-fall/);
    expect(
      MOTION_VERBS.some((verb) =>
        new RegExp(`\\b${verb}\\b`, "i").test(scene2!.prompt),
      ),
    ).toBe(true);

    // The two panels must be visually distinct prompts.
    expect(scene1!.prompt).not.toBe(scene2!.prompt);
  });
});
