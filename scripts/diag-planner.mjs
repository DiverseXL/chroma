#!/usr/bin/env node
/**
 * Diagnostic only. Not part of the test suite. Run manually with:
 *   node scripts/diag-planner.mjs
 *
 * Runs the Scene Planner (packages/core executePlan) against the apple brief
 * and prints the raw GraphSpec JSON plus the image prompt for each panel.
 *
 * Requires a prior `pnpm build` so packages/core/dist is current, and a
 * GEMINI_API_KEY / GOOGLE_MODEL_TEXT in .env. This script makes real LLM
 * calls; it is never invoked by `pnpm test`.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BRIEF = "a picture of an apple tree and next an apple falling";
const PLAN_MODULE = new URL(
  "../packages/core/dist/executors/plan.js",
  pathToFileURL(`${process.cwd()}${path.sep}`),
);

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`FAIL ${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value.trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Minimal Gemini text adapter so executePlan can run outside the web app.
 * Mirrors the production adapter's 5xx retry behaviour, nothing more.
 */
function makeCompleteText(apiKey, textModel) {
  return async function completeText(req) {
    const text = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;
    const body = {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        ...(req.json ? { responseMimeType: "application/json" } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent`;

    let lastError = "";
    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const raw = await response.text();
      if (response.ok) {
        const parsedBody = JSON.parse(raw);
        const out = parsedBody?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        let parsed;
        if (req.json) parsed = JSON.parse(out);
        return { text: out, parsed, metadata: { model: textModel } };
      }
      lastError = `HTTP ${response.status}: ${raw.slice(0, 300)}`;
      if (response.status < 500 || attempt === 4) break;
      await sleep(1000 * 2 ** (attempt - 1));
    }
    throw new Error(`Gemini text call failed: ${lastError}`);
  };
}

async function main() {
  loadEnv();
  const apiKey = requireEnv("GEMINI_API_KEY");
  const textModel = requireEnv("GOOGLE_MODEL_TEXT");

  if (!existsSync(PLAN_MODULE)) {
    console.error("FAIL packages/core/dist not found. Run `pnpm build` first.");
    process.exit(1);
  }

  const { executePlan } = await import(PLAN_MODULE.href);

  const ctx = {
    providers: { text: { completeText: makeCompleteText(apiKey, textModel) } },
    adapter: null,
    db: null,
    runId: "diag",
    nodeId: "diag:plan-0",
    artifacts: {},
  };

  const graphSpec = await executePlan(BRIEF, ctx);

  console.log("=== Raw GraphSpec JSON ===");
  console.log(JSON.stringify(graphSpec, null, 2));

  console.log("=== Prompt per panel ===");
  const scenes = graphSpec.metadata?.scenes ?? [];
  for (const scene of scenes) {
    console.log(`\n--- Panel ${scene.panelIndex} ---`);
    console.log(`sceneDescription: ${scene.sceneDescription}`);
    console.log(`action: ${scene.action}`);
    console.log(`prompt: ${scene.prompt}`);
  }
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
