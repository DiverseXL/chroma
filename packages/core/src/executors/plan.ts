import { compileGraph } from "../graph/compiler.js";
import {
  ProviderError,
  isProviderRateLimitError,
} from "../provider/adapter.js";
import type { GraphSpec } from "../types/index.js";
import type { ExecutionContext } from "./types.js";

/**
 * Verbatim system prompt delivered to the Planner agent.
 * This string must not be altered without updating the corresponding tests.
 */
const PLANNER_SYSTEM_PROMPT =
  "You are the Planner agent in Chroma, a multi-agent image generation system. " +
  "Given a creative brief, output a directed acyclic graph of nodes that will satisfy it. " +
  "The graph must include exactly one PLAN node (the root), at least one STYLE_ANALYSIS node, " +
  "one PROMPT_COMPILE node per panel, one IMAGE_GENERATE node per panel, " +
  "one CRITIQUE node per IMAGE_GENERATE node, one GATE node per CRITIQUE node, " +
  "and exactly one COMPOSE node at the end. Panels run in parallel. " +
  "Return strict JSON matching this shape: { nodes: NodeSpec[], edges: EdgeSpec[] } " +
  "where NodeSpec = { id, kind, label, inputs: Record<string,string>, outputs: string[] } " +
  "and EdgeSpec = { from, to, fromPort, toPort }. " +
  "Every input value must be exactly a source reference in the form \"sourceNodeId.outputPort\", " +
  "and must agree with the corresponding edge's from, fromPort, to, and toPort. " +
  "Node ids must be unique and human-readable (e.g. panel1_prompt). " +
  "Do not include any text outside the JSON.";

function buildFallbackStoryboard(): GraphSpec {
  const nodes: GraphSpec["nodes"] = [
    {
      id: "plan",
      kind: "PLAN",
      label: "Storyboard Plan",
      inputs: {},
      outputs: ["brief"],
    },
    {
      id: "style",
      kind: "STYLE_ANALYSIS",
      label: "Style Analysis",
      inputs: { brief: "plan.brief" },
      outputs: ["style"],
    },
  ];
  const edges: GraphSpec["edges"] = [
    { from: "plan", to: "style", fromPort: "brief", toPort: "brief" },
  ];

  for (const panel of [1, 2]) {
    const prompt = `panel${panel}_prompt`;
    const image = `panel${panel}_image`;
    const critique = `panel${panel}_critique`;
    const gate = `panel${panel}_gate`;
    nodes.push(
      {
        id: prompt,
        kind: "PROMPT_COMPILE",
        label: `Panel ${panel} Prompt`,
        inputs: {
          brief: "plan.brief",
          style: "style.style",
        },
        outputs: ["prompt"],
      },
      {
        id: image,
        kind: "IMAGE_GENERATE",
        label: `Panel ${panel} Image`,
        inputs: { prompt: `${prompt}.prompt` },
        outputs: ["image"],
      },
      {
        id: critique,
        kind: "CRITIQUE",
        label: `Panel ${panel} Critique`,
        inputs: {
          image: `${image}.image`,
          prompt: `${prompt}.prompt`,
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
      { from: "plan", to: prompt, fromPort: "brief", toPort: "brief" },
      { from: "style", to: prompt, fromPort: "style", toPort: "style" },
      { from: prompt, to: image, fromPort: "prompt", toPort: "prompt" },
      { from: image, to: critique, fromPort: "image", toPort: "image" },
      { from: prompt, to: critique, fromPort: "prompt", toPort: "prompt" },
      {
        from: critique,
        to: gate,
        fromPort: "critique",
        toPort: "critique",
      },
    );
  }

  nodes.push({
    id: "compose",
    kind: "COMPOSE",
    label: "Compose Storyboard",
    inputs: {
      panel1: "panel1_gate.panel1",
      panel2: "panel2_gate.panel2",
    },
    outputs: ["final"],
  });
  edges.push(
    {
      from: "panel1_gate",
      to: "compose",
      fromPort: "panel1",
      toPort: "panel1",
    },
    {
      from: "panel2_gate",
      to: "compose",
      fromPort: "panel2",
      toPort: "panel2",
    },
  );

  return {
    nodes,
    edges,
    metadata: { fallback: true, reason: "planner_rate_limited" },
  };
}

function isPlannerRateLimit(error: unknown): boolean {
  return (
    isProviderRateLimitError(error) ||
    (error instanceof Error && /Google API.*HTTP (429|503)/.test(error.message))
  );
}

/**
 * Input payload expected by the Plan executor.
 */
export interface PlanInput {
  brief?: string;
  panelCount?: number;
}

/**
 * Generates a GraphSpec by asking the Planner agent (Gemini text) to produce a
 * DAG satisfying the creative brief.
 *
 * The output JSON is validated by GraphCompiler. On validation failure the
 * prompt is retried once with the error appended. If validation fails twice,
 * a ProviderError with code "planner_output_invalid" is thrown.
 *
 * @param input Creative brief and optional panel count.
 * @param ctx Node execution context.
 * @returns Validated GraphSpec produced by the Planner agent.
 */
export async function executePlan(
  input: PlanInput | string | unknown,
  ctx: ExecutionContext,
): Promise<GraphSpec> {
  const briefText =
    typeof input === "string"
      ? input
      : typeof input === "object" && input !== null && "brief" in input
        ? String((input as { brief?: unknown }).brief ?? "Storyboard")
        : "Storyboard";

  const panelCount =
    typeof input === "object" &&
    input !== null &&
    "panelCount" in input &&
    typeof (input as { panelCount?: unknown }).panelCount === "number"
      ? (input as { panelCount: number }).panelCount
      : 4;

  const userPrompt =
    `Brief: ${briefText}\n\n` +
    `Produce a storyboard with ${panelCount} panel(s). ` +
    `Panels may run in parallel. ` +
    `Return only the JSON object described in the system prompt.`;

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt =
      attempt === 1
        ? userPrompt
        : `${userPrompt}\n\nPrevious attempt produced an invalid graph. Error: ${lastError ?? "unknown"}. Fix the JSON and try again.`;

    let result;
    try {
      result = await ctx.providers.text.completeText({
        system: PLANNER_SYSTEM_PROMPT,
        prompt,
        json: true,
        temperature: 0.3,
      });
    } catch (error) {
      if (isPlannerRateLimit(error)) {
        const fallback = buildFallbackStoryboard();
        compileGraph(fallback);
        return fallback;
      }
      throw error;
    }

    try {
      const spec = result.parsed as GraphSpec;
      // Surface which text model actually served this plan (and whether the
      // chain fell back) so the UI can badge the PLAN node.
      if (
        result.metadata != null &&
        typeof spec === "object" &&
        spec !== null
      ) {
        spec.metadata = { ...(spec.metadata ?? {}), ...result.metadata };
      }
      compileGraph(spec);
      return spec;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new ProviderError(
    `Planner produced an invalid GraphSpec after 2 attempts. Last error: ${lastError ?? "unknown"}`,
    { code: "planner_output_invalid" },
  );
}
