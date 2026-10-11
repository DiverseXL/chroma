import { compileGraph } from "../graph/compiler.js";
import {
  ProviderError,
  isProviderRateLimitError,
} from "../provider/adapter.js";
import type { GraphSpec } from "../types/index.js";
import type { ExecutionContext } from "./types.js";

const STORY_BIBLE_SYSTEM_PROMPT = `You are the Story Architect in Chroma. Read the creative brief. Extract a
structured Story Bible that every panel will inherit.

Return strict JSON matching this schema:
{
  panelCount: number (the number of panels the brief asks for; default 4),
  characters: [
    { name: string, description: string, appearance: string }
  ],
  locations: [
    { name: string, description: string, timeOfDay: string, atmosphere: string }
  ],
  visualStyle: {
    palette: string,
    lighting: string,
    mood: string,
    medium: string,
    era: string
  },
  overallArc: string (one sentence describing the transition across panels)
}

Every field must be specific and concrete. No placeholder text. If the brief
is vague, make confident choices that fit its tone. Return only JSON.`;

const SCENE_PLANNER_SYSTEM_PROMPT = `You are the Scene Planner in Chroma. Given a Story Bible and a panel index
and total panel count, describe what happens in that specific panel.

Return strict JSON matching this schema:
{
  panelIndex: number,
  sceneDescription: string (one sentence of what happens),
  subject: string (who or what is the focus),
  action: string (what is happening),
  cameraAngle: string (wide / medium / close-up / establishing / etc),
  prompt: string (a complete image-generation prompt, at least 25 words,
                  that inherits every aspect of the visualStyle from the bible
                  and describes this specific panel's scene. No bullet points.
                  No placeholder text.)
}

The prompt must be specific enough that an image model produces a coherent
panel without seeing the bible. Return only JSON.`;

export interface StoryBible {
  panelCount: number;
  characters: Array<{
    name: string;
    description: string;
    appearance: string;
  }>;
  locations: Array<{
    name: string;
    description: string;
    timeOfDay: string;
    atmosphere: string;
  }>;
  visualStyle: {
    palette: string;
    lighting: string;
    mood: string;
    medium: string;
    era: string;
  };
  overallArc: string;
}

export interface ScenePlan {
  panelIndex: number;
  sceneDescription: string;
  subject: string;
  action: string;
  cameraAngle: string;
  prompt: string;
}

type PlannerGraph = GraphSpec & Record<string, unknown>;

const FALLBACK_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "by", "for", "from", "in", "into",
  "is", "of", "on", "or", "the", "through", "to", "with", "panel", "panels",
  "storyboard", "story", "show", "showing", "about", "that", "this",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseStoryBible(value: unknown): StoryBible {
  if (!isRecord(value) || !isRecord(value.visualStyle)) {
    throw new ProviderError("Story Architect returned an invalid Story Bible", {
      code: "planner_output_invalid",
    });
  }

  const visualStyle = value.visualStyle;
  const fields = ["palette", "lighting", "mood", "medium", "era"] as const;
  if (
    !fields.every((field) => nonEmptyString(visualStyle[field])) ||
    !Number.isInteger(value.panelCount) ||
    Number(value.panelCount) < 1 ||
    !nonEmptyString(value.overallArc) ||
    !Array.isArray(value.characters) ||
    !Array.isArray(value.locations) ||
    !value.characters.every(
      (character) =>
        isRecord(character) &&
        nonEmptyString(character.name) &&
        nonEmptyString(character.description) &&
        nonEmptyString(character.appearance),
    ) ||
    !value.locations.every(
      (location) =>
        isRecord(location) &&
        nonEmptyString(location.name) &&
        nonEmptyString(location.description) &&
        nonEmptyString(location.timeOfDay) &&
        nonEmptyString(location.atmosphere),
    )
  ) {
    throw new ProviderError("Story Architect returned an incomplete Story Bible", {
      code: "planner_output_invalid",
    });
  }

  return value as unknown as StoryBible;
}

function parseScenePlan(value: unknown, panelIndex: number): ScenePlan {
  if (
    !isRecord(value) ||
    value.panelIndex !== panelIndex ||
    !nonEmptyString(value.sceneDescription) ||
    !nonEmptyString(value.subject) ||
    !nonEmptyString(value.action) ||
    !nonEmptyString(value.cameraAngle) ||
    !nonEmptyString(value.prompt) ||
    value.prompt.trim().split(/\s+/).length < 25
  ) {
    throw new ProviderError(
      `Scene Planner returned an incomplete scene plan for panel ${panelIndex}`,
      { code: "planner_output_invalid" },
    );
  }

  return {
    panelIndex,
    sceneDescription: value.sceneDescription,
    subject: value.subject,
    action: value.action,
    cameraAngle: value.cameraAngle,
    prompt: value.prompt.trim(),
  };
}

function inferPanelCount(brief: string, requestedPanelCount?: number): number {
  if (requestedPanelCount) return requestedPanelCount;
  const digitCount = brief.match(/\b(\d+)[ -]?panels?\b/i)?.[1];
  if (digitCount) return Math.max(1, Number.parseInt(digitCount, 10));
  const wordCount = brief.match(
    /\b(one|two|three|four|five|six|seven|eight|nine)[ -]?panels?\b/i,
  )?.[1];
  const numberWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
  };
  return wordCount ? numberWords[wordCount.toLowerCase()] : 4;
}

function extractBriefNouns(brief: string): string[] {
  const words = brief.replaceAll("-", " ").match(/[A-Za-z][A-Za-z']*/g) ?? [];
  return [
    ...new Set(
      words.filter(
        (word) =>
          word.length > 2 && !FALLBACK_STOP_WORDS.has(word.toLowerCase()),
      ),
    ),
  ];
}

function buildFallbackStoryBible(brief: string, panelCount: number): StoryBible {
  const nouns = extractBriefNouns(brief);
  const locationName = nouns.find((word) =>
    /forest|city|village|desert|ocean|space|mountain|house|castle|street/i.test(
      word,
    ),
  );
  const characterName = nouns.find((word) =>
    /astronaut|person|woman|man|child|boy|girl|fox|dog|cat|robot|knight/i.test(
      word,
    ),
  );

  return {
    panelCount,
    characters: characterName
      ? [
          {
            name: characterName,
            description: `The ${characterName} at the center of the brief`,
            appearance: `Distinctive ${characterName} silhouette, clearly visible in every scene`,
          },
        ]
      : [],
    locations: locationName
      ? [
          {
            name: locationName,
            description: `A setting shaped around ${locationName}`,
            timeOfDay: "atmospheric dusk",
            atmosphere: "immersive, cinematic, and full of environmental detail",
          },
        ]
      : [],
    visualStyle: {
      palette: "rich colors drawn from the brief, with clear foreground-background contrast",
      lighting: "soft directional cinematic lighting with visible highlights and shadows",
      mood: "cinematic, atmospheric, and adventurous",
      medium: "detailed digital illustration",
      era: "contemporary",
    },
    overallArc: `The scenes develop the central idea of ${nouns.slice(0, 3).join(" ") || "the brief"} across ${panelCount} panels.`,
  };
}

function buildFallbackScenes(
  bible: StoryBible,
  brief: string,
): ScenePlan[] {
  const nouns = extractBriefNouns(brief);
  return Array.from({ length: bible.panelCount }, (_, offset) => {
    const panelIndex = offset + 1;
    const subject = nouns.length
      ? nouns[offset % nouns.length]
      : "story subject";
    const action = `moves through the scene in panel ${panelIndex}`;
    const { visualStyle } = bible;
    return {
      panelIndex,
      sceneDescription: `${subject} ${action}.`,
      subject,
      action,
      cameraAngle: "wide cinematic view",
      prompt: `${subject} in ${visualStyle.medium} style, ${visualStyle.palette} palette, ${visualStyle.lighting}, cinematic composition, clearly depicting ${action}.`,
    };
  });
}

function shortSubject(subject: string): string {
  return subject.trim().split(/\s+/).slice(0, 4).join(" ");
}

function buildStoryboard(
  bible: StoryBible,
  scenes: ScenePlan[],
  metadata: Record<string, unknown>,
): PlannerGraph {
  const planOutputs = [
    "brief",
    "storyBible",
    ...scenes.map((scene) => `scene_${scene.panelIndex}`),
  ];
  const nodes: GraphSpec["nodes"] = [
    {
      id: "plan",
      kind: "PLAN",
      label: "Story Bible and Scene Plans",
      inputs: {},
      outputs: planOutputs,
    },
    {
      id: "style",
      kind: "STYLE_ANALYSIS",
      label: "Story Bible Visual Style",
      inputs: { storyBible: "plan.storyBible" },
      outputs: ["style"],
    },
  ];
  const edges: GraphSpec["edges"] = [
    { from: "plan", to: "style", fromPort: "storyBible", toPort: "storyBible" },
  ];

  for (const scene of scenes) {
    const panel = scene.panelIndex;
    const prompt = `panel${panel}_prompt`;
    const image = `panel${panel}_image`;
    const critique = `panel${panel}_critique`;
    const gate = `panel${panel}_gate`;
    const subject = shortSubject(scene.subject);
    const scenePort = `scene_${panel}`;

    nodes.push(
      {
        id: prompt,
        kind: "PROMPT_COMPILE",
        label: `Prompt: ${subject}`,
        inputs: {
          scenePlan: `plan.${scenePort}`,
          style: "style.style",
        },
        outputs: ["prompt"],
      },
      {
        id: image,
        kind: "IMAGE_GENERATE",
        label: `Image: ${subject}`,
        inputs: { prompt: `${prompt}.prompt` },
        outputs: ["image"],
      },
      {
        id: critique,
        kind: "CRITIQUE",
        label: `Critique: ${subject}`,
        inputs: {
          image: `${image}.image`,
          scenePlan: `plan.${scenePort}`,
          style: "style.style",
        },
        outputs: ["critique"],
      },
      {
        id: gate,
        kind: "GATE",
        label: `Panel ${panel} Gate`,
        inputs: { critique: `${critique}.critique` },
        outputs: [`panel${panel}`],
      },
    );
    edges.push(
      {
        from: "plan",
        to: prompt,
        fromPort: scenePort,
        toPort: "scenePlan",
      },
      { from: "style", to: prompt, fromPort: "style", toPort: "style" },
      { from: prompt, to: image, fromPort: "prompt", toPort: "prompt" },
      { from: image, to: critique, fromPort: "image", toPort: "image" },
      {
        from: "plan",
        to: critique,
        fromPort: scenePort,
        toPort: "scenePlan",
      },
      { from: "style", to: critique, fromPort: "style", toPort: "style" },
      {
        from: critique,
        to: gate,
        fromPort: "critique",
        toPort: "critique",
      },
    );
  }

  const composeInputs: Record<string, string> = {};
  for (const scene of scenes) {
    const panel = scene.panelIndex;
    composeInputs[`panel${panel}`] = `panel${panel}_gate.panel${panel}`;
  }
  nodes.push({
    id: "compose",
    kind: "COMPOSE",
    label: "Compose Storyboard",
    inputs: composeInputs,
    outputs: ["final"],
  });
  for (const scene of scenes) {
    const panel = scene.panelIndex;
    edges.push({
      from: `panel${panel}_gate`,
      to: "compose",
      fromPort: `panel${panel}`,
      toPort: `panel${panel}`,
    });
  }

  const graph: PlannerGraph = {
    nodes,
    edges,
    metadata: {
      ...metadata,
      storyBible: bible,
      scenes,
    },
    storyBible: bible,
  };
  for (const scene of scenes) {
    graph[`scene_${scene.panelIndex}`] = scene;
  }
  return graph;
}

function isPlannerRateLimit(error: unknown): boolean {
  return (
    isProviderRateLimitError(error) ||
    (error instanceof Error && /Google API.*HTTP (429|503)/.test(error.message))
  );
}

export interface PlanInput {
  brief?: string;
  panelCount?: number;
}

export async function executePlan(
  input: PlanInput | string | unknown,
  ctx: ExecutionContext,
): Promise<GraphSpec> {
  let briefText =
    typeof input === "string"
      ? input
      : isRecord(input) && "brief" in input
        ? String(input.brief ?? "Storyboard")
        : "";

  if (!briefText) {
    const run = await ctx.db.run.findUnique({
      where: { id: ctx.runId },
      select: { brief: true },
    });
    briefText = run?.brief ?? "Storyboard";
  }

  const requestedPanelCount =
    isRecord(input) &&
    typeof input.panelCount === "number" &&
    Number.isInteger(input.panelCount) &&
    input.panelCount > 0
      ? input.panelCount
      : undefined;

  try {
    const bibleResult = await ctx.providers.text.completeText({
      system: STORY_BIBLE_SYSTEM_PROMPT,
      prompt:
        `Creative brief:\n${briefText}` +
        (requestedPanelCount
          ? `\n\nUse exactly ${requestedPanelCount} panels.`
          : ""),
      json: true,
      temperature: 0.3,
    });
    const bible = parseStoryBible(bibleResult.parsed);
    bible.panelCount = inferPanelCount(briefText, requestedPanelCount ?? bible.panelCount);

    const sceneResults = await Promise.all(
      Array.from({ length: bible.panelCount }, async (_, offset) => {
        const panelIndex = offset + 1;
        const result = await ctx.providers.text.completeText({
          system: SCENE_PLANNER_SYSTEM_PROMPT,
          prompt:
            `Story Bible:\n${JSON.stringify(bible)}\n\n` +
            `Panel index: ${panelIndex}\nTotal panel count: ${bible.panelCount}`,
          json: true,
          temperature: 0.5,
        });
        return {
          scene: parseScenePlan(result.parsed, panelIndex),
          metadata: result.metadata,
        };
      }),
    );

    const scenes = sceneResults.map(({ scene }) => scene);
    const providerMetadata = [
      bibleResult.metadata,
      ...sceneResults.map(({ metadata: sceneMetadata }) => sceneMetadata),
    ].filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    );
    const servedModels = [
      ...new Set(
        providerMetadata
          .map((entry) => entry.model)
          .filter((model): model is string => typeof model === "string"),
      ),
    ];
    const metadata: Record<string, unknown> = {};
    if (servedModels.length > 0) {
      metadata.model = servedModels[0];
      if (servedModels.length > 1) metadata.models = servedModels;
    }
    if (providerMetadata.some((entry) => entry.fallback === true)) {
      metadata.fallback = true;
    }
    const graph = buildStoryboard(bible, scenes, metadata);
    compileGraph(graph);
    return graph;
  } catch (error) {
    if (!isPlannerRateLimit(error)) throw error;
    const bible = buildFallbackStoryBible(
      briefText,
      inferPanelCount(briefText, requestedPanelCount),
    );
    const scenes = buildFallbackScenes(bible, briefText);
    const graph = buildStoryboard(bible, scenes, {
      fallback: true,
      reason: "planner_rate_limited",
    });
    compileGraph(graph);
    return graph;
  }
}
