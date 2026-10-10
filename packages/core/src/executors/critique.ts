import { readArtifact } from "../storage/local.js";
import type { ExecutionContext } from "./types.js";
import type { StyleDescriptor } from "./style_analysis.js";

/**
 * Output of critique execution.
 */
export interface CritiqueOutput {
  score: number;
  feedback: string;
  issues: string[];
}

/**
 * Builds the vision rubric from the style descriptor and panel intent.
 *
 * The rubric instructs the model to return a specific JSON shape so that
 * the response can be parsed directly into a CritiqueResult.
 *
 * @param style Style descriptor extracted by the Style Analyst.
 * @param panelIntent Description of what this panel should depict.
 */
function buildRubric(
  style: StyleDescriptor | undefined,
  panelIntent: string,
): string {
  const styleBlock = style
    ? `Expected style:
- Palette: ${style.palette}
- Lighting: ${style.lighting}
- Mood: ${style.mood}
- Medium: ${style.medium}
- Era: ${style.era}
- Camera: ${style.camera}`
    : "Expected style: cinematic, warm, high quality";

  return (
    `You are the Critic agent in Chroma, a multi-agent image generation system.\n` +
    `Evaluate the attached image against the following criteria.\n\n` +
    `Panel intent: ${panelIntent}\n` +
    `${styleBlock}\n\n` +
    `Return strict JSON with exactly this shape and no other text:\n` +
    `{ "score": <float 0..1>, "feedback": "<narrative>", "issues": ["<specific issue 1>", ...] }\n` +
    `Score 1.0 means perfect adherence. Scores below 0.7 indicate unacceptable output. ` +
    `Issues must be specific, concrete, and one per array entry.`
  );
}

/**
 * Resolves the Scheduler's input payload to the fields the Critic needs.
 *
 * The Scheduler builds the payload with one key per input port, wrapping the
 * upstream node's output under that port name (e.g. `{ in: { artifactId } }`
 * or `{ image: { artifactId } }`). Both that wrapped form and a flat payload
 * are accepted, mirroring executeGate.
 *
 * @param input Raw input payload delivered by the Scheduler.
 * @returns The object that carries the artifact fields.
 */
function unwrapPortPayload(
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof input.artifactId === "string") {
    return input;
  }

  for (const value of Object.values(input)) {
    if (typeof value === "object" && value !== null) {
      const nested = value as Record<string, unknown>;
      if (typeof nested.artifactId === "string") {
        return nested;
      }
    }
  }

  return input;
}

/**
 * Evaluates a generated image against the style descriptor and panel intent.
 *
 * Reads the artifact bytes, base64-encodes them, and calls
 * ctx.providers.vision.scoreImage with a structured rubric. Returns the raw
 * score and issues so the Scheduler can decide whether to regenerate.
 *
 * Score threshold for acceptance is 0.7 (enforced by the Scheduler, not here).
 *
 * @param input Upstream artifact ID, style descriptor, and panel intent.
 * @param ctx Node execution context.
 * @returns Critique score, feedback narrative, and specific issues.
 */
export async function executeCritique(
  input: unknown,
  ctx: ExecutionContext,
): Promise<CritiqueOutput> {
  let artifactId = "stub-artifact-id";
  let style: StyleDescriptor | undefined;
  let panelIntent = "Generate a high-quality cinematic image";

  if (typeof input === "object" && input !== null) {
    const inp = unwrapPortPayload(input as Record<string, unknown>);
    if (typeof inp.artifactId === "string") {
      artifactId = inp.artifactId;
    }
    if (typeof inp.style === "object" && inp.style !== null) {
      style = inp.style as StyleDescriptor;
    }
    if (typeof inp.panelIntent === "string") {
      panelIntent = inp.panelIntent;
    }
  }

  // Read artifact bytes and encode as base64 for the vision API.
  const { bytes, mimeType } = await readArtifact(ctx.db, artifactId);
  void mimeType;
  const imageBase64 = Buffer.from(bytes).toString("base64");

  const rubric = buildRubric(style, panelIntent);

  const critique = await ctx.providers.vision.scoreImage({
    artifactId,
    rubric,
    imageBase64,
  });

  return {
    score: critique.score,
    feedback: critique.feedback,
    issues: critique.issues,
  };
}
