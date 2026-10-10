import type { ExecutionContext } from "./types.js";

/**
 * Output of critique execution.
 */
export interface CritiqueOutput {
  score: number;
  feedback: string;
  issues: string[];
}

/**
 * Evaluates image quality against generation guidelines.
 * TODO (Step 3): Implement real multimodal evaluation and automated prompt diagnostics.
 *
 * @param input Upstream artifact ID and evaluation rubric.
 * @param ctx Node execution context.
 * @returns Quality score, feedback narrative, and identified issues.
 */
export async function executeCritique(
  input: unknown,
  ctx: ExecutionContext,
): Promise<CritiqueOutput> {
  const artifactId =
    typeof input === "object" && input !== null && "artifactId" in input
      ? String((input as { artifactId: unknown }).artifactId)
      : "stub-artifact-id";

  const critique = await ctx.adapter.scoreImage({
    artifactId,
    rubric: "Quality and aesthetic adherence",
  });

  return {
    score: critique.score,
    feedback: critique.feedback,
    issues: critique.issues,
  };
}
