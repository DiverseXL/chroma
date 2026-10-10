import type { CritiqueResult } from "../provider/adapter.js";
import type { ExecutionContext } from "./types.js";

/**
 * Output of gate evaluation.
 */
export interface GateOutput {
  decision: "pass" | "regenerate";
  score?: number;
  feedback?: string;
  issues?: string[];
}

/**
 * Quality gate that routes execution based on the upstream critique score.
 *
 * When critique.score >= 0.7 the gate passes; otherwise it signals regeneration
 * by returning { decision: "regenerate" }. The Scheduler observes the critique
 * node output directly for the regeneration logic — the gate output is used
 * downstream for logging and diagnostic purposes.
 *
 * @param input Upstream critique result.
 * @param _ctx Node execution context (unused by this executor).
 * @returns Gate decision, score, and feedback.
 */
export async function executeGate(
  input: unknown,
  _ctx: ExecutionContext,
): Promise<GateOutput> {
  const THRESHOLD = 0.7;

  // Accept a CritiqueResult directly or wrapped in { critique: ... }.
  let critiqueScore: number | undefined;
  let feedback: string | undefined;
  let issues: string[] | undefined;

  if (typeof input === "object" && input !== null) {
    const inp = input as Record<string, unknown>;

    // Wrapped form: { critique: CritiqueResult }
    if (typeof inp.critique === "object" && inp.critique !== null) {
      const c = inp.critique as CritiqueResult;
      critiqueScore = typeof c.score === "number" ? c.score : undefined;
      feedback = typeof c.feedback === "string" ? c.feedback : undefined;
      issues = Array.isArray(c.issues) ? c.issues : undefined;
    } else {
      // Flat form: { score, feedback, issues }
      critiqueScore =
        typeof inp.score === "number" ? inp.score : undefined;
      feedback =
        typeof inp.feedback === "string" ? inp.feedback : undefined;
      issues = Array.isArray(inp.issues) ? inp.issues : undefined;
    }
  }

  if (critiqueScore === undefined || critiqueScore >= THRESHOLD) {
    return {
      decision: "pass",
      score: critiqueScore,
    };
  }

  return {
    decision: "regenerate",
    score: critiqueScore,
    feedback,
    issues,
  };
}
