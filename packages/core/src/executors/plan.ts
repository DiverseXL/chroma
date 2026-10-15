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

const BEAT_EXTRACTOR_SYSTEM_PROMPT = `You are the Story Beat Extractor for Chroma. Read the creative brief.
Identify the distinct visual beats the brief describes, in order. A beat
is one moment in time that a single image can depict.

Rules:
- If the brief describes an action (falling, running, walking, rising,
  drifting, jumping, opening, closing, melting, arriving, leaving), that
  action IS a beat. Do not merge it with its setup.
- If the brief describes a before/after or then/next transition, the before
  and after are separate beats.
- Beats must be visually distinct. Two panels should not show the same
  subject in the same pose with only minor variation.

Return strict JSON:
{ beats: [{ index: number, description: string, actionVerb: string | null,
            subject: string, stage: 'setup' | 'action' | 'aftermath' }] }

actionVerb is the specific verb if the beat is an action, null otherwise.
Return only JSON.`;

const PANEL_PROMPT_WRITER_SYSTEM = `You are the Panel Prompt Writer for Chroma. Write a single detailed image generation prompt for panel {panelIndex}. The panel must depict beat {panelIndex} exactly.

Rules:
- If the beat has actionVerb, the prompt MUST contain that verb or a clear synonym. 'an apple falling' must contain 'falling' or 'mid-fall' or 'detached, falling'. It must NOT say 'hanging' or 'on the branch'.
- If the beat is 'setup', the prompt should show the scene BEFORE the action.
- If the beat is 'action', the prompt should show the subject mid-action, with visible motion cues (position, blur, posture, gravity).
- If the beat is 'aftermath', the prompt should show the result.
- Do NOT reuse phrasing from other panels. Each prompt must describe a visually distinct moment.
- Prompt must be at least 30 words.
- Inherit every visualStyle field from the Story Bible.

Return strict JSON: { prompt: string }`;

/**
 * Motion verbs accepted as evidence that a panel prompt depicts its beat's
 * action. A prompt that contains none of these (and none of the beat's own
 * actionVerb) is treated as depicting the setup instead of the action and is
 * rewritten once by the Panel Prompt Writer.
 */
export const MOTION_VERBS = [
  "fall",
  "falling",
  "run",
  "running",
  "walk",
  "walking",
  "rise",
  "rising",
  "drift",
  "drifting",
  "jump",
  "jumping",
  "open",
  "opening",
  "close",
  "closing",
  "melt",
  "melting",
  "arrive",
  "arriving",
  "leave",
  "leaving",
  "detach",
  "detached",
  "plunge",
  "plunging",
  "cascade",
  "descend",
  "descending",
];

/** Minimum word count enforced on a Panel Prompt Writer response. */
const MIN_PANEL_PROMPT_WORDS = 30;

const BEAT_STAGES = new Set(["setup", "action", "aftermath"]);

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

/** When in the arc a beat occurs. */
export type BeatStage = "setup" | "action" | "aftermath";

/**
 * One distinct visual moment extracted from the creative brief.
 * Exactly one beat maps to one panel.
 */
export interface StoryBeat {
  index: number;
  description: string;
  actionVerb: string | null;
  subject: string;
  stage: BeatStage;
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

/**
 * Validates the Beat Extraction (Call A) response.
 *
 * @param value Parsed JSON returned by the beat extractor.
 * @returns Beats sorted by their declared index.
 * @throws {ProviderError} When the payload is missing or any beat is malformed.
 */
function parseBeats(value: unknown): StoryBeat[] {
  if (
    !isRecord(value) ||
    !Array.isArray(value.beats) ||
    value.beats.length === 0
  ) {
    throw new ProviderError("Story Beat Extractor returned no beats", {
      code: "planner_output_invalid",
    });
  }

  const beats: StoryBeat[] = [];
  for (const entry of value.beats) {
    if (
      !isRecord(entry) ||
      !Number.isInteger(entry.index) ||
      !nonEmptyString(entry.description) ||
      !nonEmptyString(entry.subject) ||
      !(entry.actionVerb === null || nonEmptyString(entry.actionVerb)) ||
      !nonEmptyString(entry.stage) ||
      !BEAT_STAGES.has(entry.stage)
    ) {
      throw new ProviderError("Story Beat Extractor returned an invalid beat", {
        code: "planner_output_invalid",
      });
    }
    beats.push({
      index: Number(entry.index),
      description: entry.description.trim(),
      actionVerb:
        entry.actionVerb === null ? null : entry.actionVerb.trim(),
      subject: entry.subject.trim(),
      stage: entry.stage as BeatStage,
    });
  }

  return beats.sort((a, b) => a.index - b.index);
}

/**
 * Extracts the prompt string from a Panel Prompt Writer response.
 *
 * @param value Parsed JSON returned by the writer.
 * @returns The trimmed prompt, or null when absent or blank.
 */
function extractPrompt(value: unknown): string | null {
  return isRecord(value) && nonEmptyString(value.prompt)
    ? value.prompt.trim()
    : null;
}

/**
 * Checks whether a prompt depicts its beat's action: it must contain the
 * beat's own actionVerb (or its stem) or any entry from MOTION_VERBS.
 *
 * @param prompt The Panel Prompt Writer prompt.
 * @param actionVerb The beat's action verb.
 */
function promptMentionsAction(prompt: string, actionVerb: string): boolean {
  const lower = prompt.toLowerCase();
  const candidates = new Set<string>([
    ...MOTION_VERBS,
    actionVerb.toLowerCase(),
  ]);
  const stem = actionVerb.toLowerCase().replace(/(?:ing|ed|es|s)$/, "");
  if (stem.length >= 3) candidates.add(stem);
  for (const candidate of candidates) {
    if (new RegExp(`\\b${candidate}\\b`).test(lower)) return true;
  }
  return false;
}

/**
 * Validates a Panel Prompt Writer response against the beat it must depict.
 * Each returned error is appended to the one permitted rewrite request.
 *
 * @param parsed Parsed JSON returned by the writer.
 * @param beat The beat this panel must depict.
 * @returns Empty when the prompt is usable; otherwise one message per violation.
 */
function validatePanelPrompt(parsed: unknown, beat: StoryBeat): string[] {
  const prompt = extractPrompt(parsed);
  if (!prompt) {
    return [
      "Your response did not contain a non-empty 'prompt' string. Return strict JSON: { prompt: string }.",
    ];
  }

  const errors: string[] = [];
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount < MIN_PANEL_PROMPT_WORDS) {
    errors.push(
      `Your previous prompt was ${wordCount} words. Write a prompt of at least ${MIN_PANEL_PROMPT_WORDS} words.`,
    );
  }
  if (beat.actionVerb && !promptMentionsAction(prompt, beat.actionVerb)) {
    errors.push(
      `Your previous prompt did not contain the action verb '${beat.actionVerb}'. The panel must depict the action, not the setup. Rewrite it.`,
    );
  }
  return errors;
}

function cameraForStage(stage: BeatStage): string {
  switch (stage) {
    case "setup":
      return "wide establishing shot";
    case "action":
      return "dynamic action shot";
    case "aftermath":
      return "medium shot";
  }
}

function actionForBeat(beat: StoryBeat): string {
  if (beat.actionVerb) return `the ${beat.subject} is ${beat.actionVerb}`;
  if (beat.stage === "setup") {
    return `the ${beat.subject} is at rest before the action`;
  }
  return `the ${beat.subject} is at rest after the action`;
}

/**
 * Builds the ScenePlan for a panel from its beat and the validated prompt.
 *
 * @param beat The beat this panel depicts.
 * @param prompt The validated Panel Prompt Writer prompt.
 */
function sceneFromBeat(beat: StoryBeat, prompt: string): ScenePlan {
  return {
    panelIndex: beat.index,
    sceneDescription: beat.description,
    subject: beat.subject,
    action: actionForBeat(beat),
    cameraAngle: cameraForStage(beat.stage),
    prompt,
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

function buildFallbackSceneForPanel(
  bible: StoryBible,
  brief: string,
  panelIndex: number,
): ScenePlan {
  const nouns = extractBriefNouns(brief);
  const subject = nouns.length
    ? nouns[(panelIndex - 1) % nouns.length]
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
}

function buildFallbackScenes(
  bible: StoryBible,
  brief: string,
): ScenePlan[] {
  return Array.from({ length: bible.panelCount }, (_, offset) =>
    buildFallbackSceneForPanel(bible, brief, offset + 1),
  );
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

function collectMetadata(metadata: unknown): Array<Record<string, unknown>> {
  return typeof metadata === "object" && metadata !== null
    ? [metadata as Record<string, unknown>]
    : [];
}

/**
 * Re-indexes beats to a contiguous 1-based sequence so panel N always maps
 * to beat N regardless of the indexes the extractor returned.
 */
function normalizeBeatIndices(beats: StoryBeat[]): StoryBeat[] {
  return beats.map((beat, offset) => ({ ...beat, index: offset + 1 }));
}

/**
 * Reconciles the extracted beat list with the planned panel count.
 * Trims excess beats; pads a deficit with continuation beats so the run
 * never drops a panel the Story Bible promised.
 */
function alignBeatCount(
  beats: StoryBeat[],
  panelCount: number,
  overallArc: string,
): StoryBeat[] {
  if (beats.length >= panelCount) return beats.slice(0, panelCount);

  const padded = [...beats];
  const lastSubject = beats[beats.length - 1]?.subject ?? "the scene";
  for (let offset = beats.length; offset < panelCount; offset++) {
    padded.push({
      index: offset + 1,
      description: `The story continues: ${overallArc}`,
      actionVerb: null,
      subject: lastSubject,
      stage: "aftermath",
    });
  }
  console.warn(
    `[plan] Story Beat Extractor returned ${beats.length} beats for ${panelCount} panels; padded ${panelCount - beats.length} beat(s).`,
  );
  return padded;
}

/**
 * Call A — Beat Extraction.
 *
 * Asks the Story Beat Extractor for one distinct beat per panel. A response
 * with the wrong beat count or an invalid shape is requested once more with
 * the specific error appended; a second failure raises planner_output_invalid.
 *
 * @param ctx Node execution context.
 * @param briefText The creative brief.
 * @param panelCount Planned panel count.
 * @param overallArc The Story Bible arc, as extra context for the extractor.
 */
async function extractBeats(
  ctx: ExecutionContext,
  briefText: string,
  panelCount: number,
  overallArc: string,
): Promise<{
  beats: StoryBeat[];
  metadatas: Array<Record<string, unknown>>;
}> {
  const basePrompt =
    `Creative brief:\n${briefText}\n\n` +
    `Story Bible overall arc: ${overallArc}\n` +
    `The storyboard has exactly ${panelCount} panels. Return exactly ` +
    `${panelCount} beats in order, one beat per panel.`;

  const first = await ctx.providers.text.completeText({
    system: BEAT_EXTRACTOR_SYSTEM_PROMPT,
    prompt: basePrompt,
    json: true,
    temperature: 0.3,
  });
  const metadatas = collectMetadata(first.metadata);

  let parsed: StoryBeat[] | null = null;
  let failure = "";
  try {
    parsed = parseBeats(first.parsed);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  if (parsed && parsed.length === panelCount) {
    return { beats: normalizeBeatIndices(parsed), metadatas };
  }

  const detail = parsed
    ? `You returned ${parsed.length} beats but the storyboard has exactly ${panelCount} panels.`
    : failure;
  const second = await ctx.providers.text.completeText({
    system: BEAT_EXTRACTOR_SYSTEM_PROMPT,
    prompt:
      `${basePrompt}\n\nYour previous response was invalid: ${detail} ` +
      `Return exactly ${panelCount} beats matching the JSON schema.`,
    json: true,
    temperature: 0.3,
  });
  metadatas.push(...collectMetadata(second.metadata));

  let retried: StoryBeat[] | null = null;
  try {
    retried = parseBeats(second.parsed);
  } catch {
    retried = null;
  }
  if (!retried) {
    throw new ProviderError(
      "Story Beat Extractor returned invalid beats after a retry",
      { code: "planner_output_invalid" },
    );
  }

  return {
    beats: normalizeBeatIndices(alignBeatCount(retried, panelCount, overallArc)),
    metadatas,
  };
}

/**
 * Call B — Panel Prompt Writer.
 *
 * Writes the image prompt for one beat. A response that fails validation
 * (missing prompt, too short, or missing the beat's action verb) is requested
 * once more with the errors appended. If the rewrite still fails the run
 * continues: the rewrite prompt is used with a logged warning, and a prompt
 * that is unusable as JSON falls back to a deterministic scene.
 *
 * @param ctx Node execution context.
 * @param beat The beat this panel must depict.
 * @param beats The full beat list, shown to the writer for context.
 * @param bible The Story Bible (visual style and fallback material).
 * @param briefText The creative brief, used by the fallback scene builder.
 */
async function writePanelPrompt(
  ctx: ExecutionContext,
  beat: StoryBeat,
  beats: StoryBeat[],
  bible: StoryBible,
  briefText: string,
): Promise<{
  scene: ScenePlan;
  metadatas: Array<Record<string, unknown>>;
}> {
  const panelIndex = beat.index;
  const system = PANEL_PROMPT_WRITER_SYSTEM.replaceAll(
    "{panelIndex}",
    String(panelIndex),
  );
  const basePrompt =
    `Story Bible visual style:\n${JSON.stringify(bible.visualStyle, null, 2)}\n\n` +
    `All beats:\n${JSON.stringify(beats, null, 2)}\n\n` +
    `This panel's beat:\n${JSON.stringify(beat, null, 2)}\n\n` +
    `Write the prompt for panel ${panelIndex} now.`;

  const metadatas: Array<Record<string, unknown>> = [];

  const first = await ctx.providers.text.completeText({
    system,
    prompt: basePrompt,
    json: true,
    temperature: 0.5,
  });
  metadatas.push(...collectMetadata(first.metadata));

  const firstPrompt = extractPrompt(first.parsed);
  const firstErrors = validatePanelPrompt(first.parsed, beat);
  if (firstPrompt && firstErrors.length === 0) {
    return { scene: sceneFromBeat(beat, firstPrompt), metadatas };
  }

  const second = await ctx.providers.text.completeText({
    system,
    prompt: `${basePrompt}\n\n${firstErrors.join("\n\n")}`,
    json: true,
    temperature: 0.5,
  });
  metadatas.push(...collectMetadata(second.metadata));

  const secondPrompt = extractPrompt(second.parsed);
  if (!secondPrompt) {
    console.warn(
      `[plan] Panel ${panelIndex} prompt writer returned no usable prompt after retry; using a deterministic fallback scene.`,
    );
    return {
      scene: buildFallbackSceneForPanel(bible, briefText, panelIndex),
      metadatas,
    };
  }

  const secondErrors = validatePanelPrompt(second.parsed, beat);
  if (secondErrors.length > 0) {
    console.warn(
      `[plan] Panel ${panelIndex} prompt still fails validation after retry (${secondErrors.join(" | ")}); using the retry prompt.`,
    );
  }
  return { scene: sceneFromBeat(beat, secondPrompt), metadatas };
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

    // Call A — Beat Extraction: enumerate the distinct moments first.
    const { beats, metadatas: beatMetadatas } = await extractBeats(
      ctx,
      briefText,
      bible.panelCount,
      bible.overallArc,
    );

    // Call B — Panel Prompt Writer: one call per panel, in parallel.
    const panelResults = await Promise.all(
      beats.map((beat) => writePanelPrompt(ctx, beat, beats, bible, briefText)),
    );
    const scenes = panelResults.map(({ scene }) => scene);

    const providerMetadata = [
      bibleResult.metadata,
      ...beatMetadatas,
      ...panelResults.flatMap(({ metadatas }) => metadatas),
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
