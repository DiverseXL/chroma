import type { ExecutionContext } from "./types.js";

/**
 * Output payload from prompt compilation.
 */
export interface PromptCompileOutput {
  prompt: string;
  panelIndex: number;
}

/**
 * Compiles a structured generation prompt for a specific panel.
 *
 * @param input Upstream style and planning input.
 * @param ctx Node execution context.
 * @returns Compiled prompt and panel identification.
 */
export async function executePromptCompile(
  input: unknown,
  ctx: ExecutionContext,
): Promise<PromptCompileOutput> {
  let panelIndex = 1;
  const match = ctx.nodeId.match(/panel-(\d+)/i);
  if (match) {
    panelIndex = parseInt(match[1], 10);
  } else if (
    typeof input === "object" &&
    input !== null &&
    "panelIndex" in input
  ) {
    panelIndex = Number((input as { panelIndex: unknown }).panelIndex);
  }

  const prompt = `Panel ${panelIndex}: A cinematic storyboard frame with warm dusk lighting and expressive character composition`;

  return {
    prompt,
    panelIndex,
  };
}
