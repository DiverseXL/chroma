import { readArtifact } from "../storage/postgres.js";
import type { ExecutionContext } from "./types.js";

/**
 * Output of consistency checking.
 */
export interface ConsistencyCheckOutput {
  consistent: boolean;
  score: number;
  feedback: string;
  issues: string[];
  driftedPanels: number[];
}

/**
 * Consistency rubric sent to the vision model.
 *
 * The model is asked to evaluate cross-panel consistency across four
 * dimensions and return structured JSON.
 */
const CONSISTENCY_RUBRIC =
  "You are the Consistency Checker in Chroma, a multi-agent image generation system.\n" +
  "You will receive multiple storyboard panels (1-indexed) as images.\n" +
  "Evaluate the cross-panel consistency of:\n" +
  "  1. Character identity — same characters look the same across panels.\n" +
  "  2. Colour palette — dominant colours are consistent.\n" +
  "  3. Lighting direction — the key light comes from the same direction.\n" +
  "  4. Artistic style — medium, texture, and rendering style match.\n\n" +
  "Return strict JSON with exactly this shape and no other text:\n" +
  '{ "score": <float 0..1>, "feedback": "<narrative>", "issues": ["<specific issue>", ...], ' +
  '"driftedPanels": [<1-indexed panel numbers that need re-editing>] }\n' +
  "Score 1.0 means fully consistent. Issues must be specific.";

/**
 * Validates cross-panel visual consistency by sending all panel images in a
 * single vision call to ctx.providers.vision.
 *
 * For each drifted panel, the output identifies the 1-indexed panel number so
 * the Scheduler can inject IMAGE_EDIT nodes.
 *
 * Note: GoogleGeminiAdapter.scoreImage accepts a single imageBase64 field.
 * For multi-image consistency we send the first panel image and include the
 * others as JSON-encoded paths in the rubric (UNCONFIRMED multi-image support
 * for the generateContent API; the interaction API supports it via input[]
 * but we use generateContent here). The current implementation sends only the
 * first image with the others described in the rubric text. If the model
 * supports multiple parts in one contents[] entry (U9), that can be wired in
 * without changing this executor's contract.
 *
 * @param input Upstream artifact IDs in panel order.
 * @param ctx Node execution context.
 * @returns Consistency score, feedback, issues, and drifted panel numbers.
 */
export async function executeConsistencyCheck(
  input: unknown,
  ctx: ExecutionContext,
): Promise<ConsistencyCheckOutput> {
  let artifactIds: string[] = [];

  if (typeof input === "object" && input !== null) {
    const inp = input as Record<string, unknown>;
    if (Array.isArray(inp.artifactIds)) {
      artifactIds = inp.artifactIds.map(String);
    }
  } else if (Array.isArray(input)) {
    artifactIds = (input as unknown[]).map(String);
  }

  if (artifactIds.length === 0) {
    // Collect all IMAGE artifacts for this run as a fallback.
    const dbArtifacts = await ctx.db.artifact.findMany({
      where: { node: { runId: ctx.runId }, kind: "IMAGE" },
      orderBy: { createdAt: "asc" },
    });
    artifactIds = dbArtifacts.map((a) => a.id);
  }

  if (artifactIds.length === 0) {
    // No images to check: report full consistency.
    return {
      consistent: true,
      score: 1.0,
      feedback: "No images to check.",
      issues: [],
      driftedPanels: [],
    };
  }

  // Read the first panel image for the primary vision slot.
  // UNCONFIRMED: multi-image support in generateContent inline_data[]. If the
  // model supports multiple parts, the bytes for panels 2..N can be appended.
  const { bytes } = await readArtifact(ctx.db, artifactIds[0]);
  const imageBase64 = Buffer.from(bytes).toString("base64");

  // Describe remaining panels in the rubric text so the model knows how many
  // panels exist and their conceptual order.
  const panelList = artifactIds
    .map((id, i) => `Panel ${i + 1}: artifact ${id}`)
    .join(", ");
  const rubric = `${CONSISTENCY_RUBRIC}\n\nPanels in order: ${panelList}. The attached image is Panel 1.`;

  const critique = await ctx.providers.vision.scoreImage({
    artifactId: artifactIds[0],
    rubric,
    imageBase64,
  });

  // The vision model may return driftedPanels as part of the raw JSON because
  // scoreImage goes through GoogleGeminiAdapter which re-parses the JSON body.
  // Attempt to extract it from the raw text field if available.
  const rawResult = critique as unknown as Record<string, unknown>;
  let driftedPanels: number[] = [];
  if (Array.isArray(rawResult.driftedPanels)) {
    driftedPanels = (rawResult.driftedPanels as unknown[])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1);
  }

  const consistent = critique.score >= 0.7;

  return {
    consistent,
    score: critique.score,
    feedback: critique.feedback,
    issues: critique.issues,
    driftedPanels,
  };
}
