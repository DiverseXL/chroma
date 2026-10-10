import type { GraphSpec } from "../types/index.js";
import type { ExecutionContext } from "./types.js";

/**
 * Generates a GraphSpec for a 2-panel storyboard given a user brief.
 * PLAN -> STYLE_ANALYSIS -> (PROMPT_COMPILE -> IMAGE_GENERATE) x 2 -> COMPOSE.
 *
 * @param input Brief or parameters for planning.
 * @param ctx Node execution context.
 * @returns Deterministic storyboard GraphSpec.
 */
export async function executePlan(
  input: { brief?: string } | string | unknown,
  _ctx: ExecutionContext,
): Promise<GraphSpec> {
  const briefText =
    typeof input === "string"
      ? input
      : typeof input === "object" && input !== null && "brief" in input
        ? String((input as { brief?: unknown }).brief ?? "Storyboard")
        : "Storyboard";

  return {
    nodes: [
      {
        id: "plan-0",
        kind: "PLAN",
        label: `Plan: ${briefText}`,
        inputs: {},
        outputs: ["storyboard"],
      },
      {
        id: "style-1",
        kind: "STYLE_ANALYSIS",
        label: "Style Analysis",
        inputs: { plan: "plan-0.storyboard" },
        outputs: ["style"],
      },
      {
        id: "prompt-panel-1",
        kind: "PROMPT_COMPILE",
        label: "Compile Prompt: Panel 1",
        inputs: { style: "style-1.style" },
        outputs: ["prompt"],
      },
      {
        id: "img-panel-1",
        kind: "IMAGE_GENERATE",
        label: "Generate Image: Panel 1",
        inputs: { prompt: "prompt-panel-1.prompt" },
        outputs: ["image"],
      },
      {
        id: "prompt-panel-2",
        kind: "PROMPT_COMPILE",
        label: "Compile Prompt: Panel 2",
        inputs: { style: "style-1.style" },
        outputs: ["prompt"],
      },
      {
        id: "img-panel-2",
        kind: "IMAGE_GENERATE",
        label: "Generate Image: Panel 2",
        inputs: { prompt: "prompt-panel-2.prompt" },
        outputs: ["image"],
      },
      {
        id: "compose-final",
        kind: "COMPOSE",
        label: "Compose Storyboard",
        inputs: {
          panel1: "img-panel-1.image",
          panel2: "img-panel-2.image",
        },
        outputs: ["final"],
      },
    ],
    edges: [
      {
        from: "plan-0",
        to: "style-1",
        fromPort: "storyboard",
        toPort: "plan",
      },
      {
        from: "style-1",
        to: "prompt-panel-1",
        fromPort: "style",
        toPort: "style",
      },
      {
        from: "style-1",
        to: "prompt-panel-2",
        fromPort: "style",
        toPort: "style",
      },
      {
        from: "prompt-panel-1",
        to: "img-panel-1",
        fromPort: "prompt",
        toPort: "prompt",
      },
      {
        from: "prompt-panel-2",
        to: "img-panel-2",
        fromPort: "prompt",
        toPort: "prompt",
      },
      {
        from: "img-panel-1",
        to: "compose-final",
        fromPort: "image",
        toPort: "panel1",
      },
      {
        from: "img-panel-2",
        to: "compose-final",
        fromPort: "image",
        toPort: "panel2",
      },
    ],
  };
}
