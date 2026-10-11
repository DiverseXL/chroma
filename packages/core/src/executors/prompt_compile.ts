import type { StyleDescriptor } from "./style_analysis.js";
import type { ExecutionContext } from "./types.js";

/**
 * Output payload from prompt compilation.
 */
export interface PromptCompileOutput {
  prompt: string;
  panelIndex: number;
}

const PROMPT_COMPILE_SYSTEM =
  "You are the Prompt Engineer in Chroma, a multi-agent image generation system. " +
  "Given a style descriptor and a panel intent, write a single detailed image-generation prompt " +
  "that inherits every attribute of the style descriptor. " +
  "The prompt must be descriptive, scene-level, at least 20 words long, and must not use bullet lists. " +
  "Return only the prompt text, no explanation, no preamble, no markdown.";

/**
 * Compiles a final image-generation prompt by combining a style descriptor with
 * per-panel intent, using Gemini text for free-form elaboration.
 *
 * @param input Upstream style descriptor and panel intent string.
 * @param ctx Node execution context.
 * @returns Compiled prompt string and panel index.
 */
export async function executePromptCompile(
  input: unknown,
  ctx: ExecutionContext,
): Promise<PromptCompileOutput> {
  // Extract panel index from the node ID or input.
  let panelIndex = 1;
  const match = ctx.nodeId.match(/panel[_-]?(\d+)/i);
  if (match) {
    panelIndex = parseInt(match[1], 10);
  } else if (
    typeof input === "object" &&
    input !== null &&
    "panelIndex" in input
  ) {
    panelIndex = Number((input as { panelIndex: unknown }).panelIndex);
  }

  // Extract style from upstream output.
  let style: StyleDescriptor | undefined;
  let panelIntent = `Panel ${panelIndex}`;

  if (typeof input === "object" && input !== null) {
    const inp = input as Record<string, unknown>;
    if (
      typeof inp.scenePlan === "object" &&
      inp.scenePlan !== null &&
      "prompt" in inp.scenePlan &&
      typeof (inp.scenePlan as { prompt?: unknown }).prompt === "string" &&
      (inp.scenePlan as { prompt: string }).prompt.trim()
    ) {
      return {
        prompt: (inp.scenePlan as { prompt: string }).prompt.trim(),
        panelIndex,
      };
    }
    if (typeof inp.style === "object" && inp.style !== null) {
      style = inp.style as StyleDescriptor;
    }
    if (typeof inp.panelIntent === "string") {
      panelIntent = inp.panelIntent;
    }
  }

  const styleBlock = style
    ? `Style descriptor:
- Palette: ${style.palette}
- Lighting: ${style.lighting}
- Mood: ${style.mood}
- Medium: ${style.medium}
- Era: ${style.era}
- Camera: ${style.camera}`
    : "Style: cinematic, warm, natural lighting";

  const userPrompt = `${styleBlock}

Panel intent: ${panelIntent}

Write the image-generation prompt now.`;

  const result = await ctx.providers.text.completeText({
    system: PROMPT_COMPILE_SYSTEM,
    prompt: userPrompt,
    json: false,
    temperature: 0.7,
  });

  return {
    prompt: result.text.trim(),
    panelIndex,
  };
}
