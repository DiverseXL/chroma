import type { NodeKind } from "../types/index.js";
import { executeCompose } from "./compose.js";
import { executeConsistencyCheck } from "./consistency_check.js";
import { executeCritique } from "./critique.js";
import { executeGate } from "./gate.js";
import { executeImageEdit } from "./image_edit.js";
import { executeImageGenerate } from "./image_generate.js";
import { executePlan } from "./plan.js";
import { executePromptCompile } from "./prompt_compile.js";
import { executeStyleAnalysis } from "./style_analysis.js";
import type { NodeExecutor } from "./types.js";

export * from "./compose.js";
export * from "./consistency_check.js";
export * from "./critique.js";
export * from "./gate.js";
export * from "./image_edit.js";
export * from "./image_generate.js";
export * from "./plan.js";
export * from "./prompt_compile.js";
export * from "./style_analysis.js";
export * from "./types.js";

/**
 * Returns the corresponding executor function for the given NodeKind.
 *
 * @param kind The kind of node to execute.
 * @returns Associated executor implementation.
 */
export function getExecutor(kind: NodeKind): NodeExecutor {
  switch (kind) {
    case "PLAN":
      return executePlan;
    case "STYLE_ANALYSIS":
      return executeStyleAnalysis;
    case "PROMPT_COMPILE":
      return executePromptCompile;
    case "IMAGE_GENERATE":
      return executeImageGenerate;
    case "IMAGE_EDIT":
      return executeImageEdit;
    case "CONSISTENCY_CHECK":
      return executeConsistencyCheck;
    case "CRITIQUE":
      return executeCritique;
    case "GATE":
      return executeGate;
    case "COMPOSE":
      return executeCompose;
    default:
      throw new Error(`Unsupported node kind: "${kind}"`);
  }
}
