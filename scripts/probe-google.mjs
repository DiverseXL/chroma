#!/usr/bin/env node
/**
 * Probe #1: Google Gemini API (Google AI Studio).
 *
 * Makes exactly two calls:
 *   1. one image-generation call (model id from GOOGLE_MODEL_NANO_BANANA)
 *   2. one vision call scoring a hardcoded tiny PNG against a trivial rubric
 *
 * Writes:
 *   docs/probe/google-generate.json  raw response body
 *   docs/probe/google-generate.png   returned image bytes
 *   docs/probe/google-vision.json    raw response body
 *
 * Endpoint (confirmed live at https://ai.google.dev/api/generate-content):
 *   POST https://generativelanguage.googleapis.com/v1beta/{model=models/*}:generateContent
 *   header: x-goog-api-key
 *   request body fields: contents[], generationConfig
 *   response body: candidates[] -> content -> parts[]
 *
 * Prints status lines only. No API key is ever hardcoded.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

// 16x16 solid red PNG, generated locally and embedded as a literal.
const TINY_TEST_IMAGE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IydHEmIY1TCqYfhqAACaMxgQdGu1YAAAAABJRU5ErkJggg==";

const IMAGE_PROMPT = "A single blue circle on a white background.";
const VISION_RUBRIC =
  "Score this image from 1 to 5 on how clearly it shows one solid blue " +
  "circle on a white background. Reply with only a JSON object of the form " +
  '{"score": <number>, "reason": "<short string>"}.';

function log(message) {
  console.log(message);
}

function loadEnv() {
  try {
    if (existsSync(".env")) process.loadEnvFile(".env");
  } catch {
    // .env is optional; env vars may already be set by the shell.
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    log(`FAIL ${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value.trim();
}

function ensureProbeDir() {
  const dir = path.join("docs", "probe");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function endpointFor(model) {
  return `${API_ROOT}/${model}:generateContent`;
}

/**
 * Returns the first part of the first candidate that carries inline image
 * bytes under `inlineData.data`.
 *
 * Documented response shape: `candidates[].content.parts[]`.
 * Source: https://ai.google.dev/api/generate-content
 */
function findInlineImageData(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    if (part && typeof part.inlineData?.data === "string") {
      return part.inlineData.data;
    }
  }
  return null;
}

/**
 * Returns the text of the first candidate's first part.
 * Source: https://ai.google.dev/api/generate-content
 */
function firstCandidateText(json) {
  const part = json?.candidates?.[0]?.content?.parts?.[0];
  return typeof part?.text === "string" ? part.text : null;
}

async function callGenerateContent(apiKey, model, body) {
  const url = endpointFor(model);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Leave json null; the raw text is still written to disk.
  }

  return { url, status: response.status, ok: response.ok, text, json };
}

async function main() {
  loadEnv();

  const apiKey = requireEnv("GEMINI_API_KEY");
  const imageModel = requireEnv("GOOGLE_MODEL_NANO_BANANA");
  const visionModel = requireEnv("GOOGLE_MODEL_VISION");
  const probeDir = ensureProbeDir();

  log(`INFO image model ${imageModel}`);
  log(`INFO vision model ${visionModel}`);
  log(`INFO image endpoint ${endpointFor(imageModel)}`);
  log(`INFO vision endpoint ${endpointFor(visionModel)}`);

  // --- Call 1: image generation -----------------------------------------
  const generatePath = path.join(probeDir, "google-generate.json");
  const generate = await callGenerateContent(apiKey, imageModel, {
    contents: [{ parts: [{ text: IMAGE_PROMPT }] }],
    // UNVERIFIED: `generationConfig.responseModalities` with enum values
    // "TEXT" / "IMAGE" is not documented on any ai.google.dev page I could
    // load in this pass. Please confirm the field name and enum casing.
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  });

  writeFileSync(generatePath, generate.text, "utf8");
  log(`INFO image generation HTTP ${generate.status}`);
  log(`INFO wrote ${generatePath}`);
  if (!generate.ok) {
    log("FAIL image generation request was not successful");
    process.exitCode = 1;
  }

  const base64Image = generate.json ? findInlineImageData(generate.json) : null;
  if (base64Image) {
    const imagePath = path.join(probeDir, "google-generate.png");
    writeFileSync(imagePath, Buffer.from(base64Image, "base64"));
    log(`INFO wrote ${imagePath}`);
  } else {
    log("WARN no inlineData.data found in candidates[0].content.parts");
  }

  // --- Call 2: vision scoring -------------------------------------------
  const visionPath = path.join(probeDir, "google-vision.json");
  const vision = await callGenerateContent(apiKey, visionModel, {
    contents: [
      {
        parts: [
          { text: VISION_RUBRIC },
          {
            // UNVERIFIED casing: the cited page's curl sample writes this as
            // `inline_data` with `mime_type` (snake_case). camelCase is the
            // protobuf-JSON equivalent; both are normally accepted.
            inlineData: {
              mimeType: "image/png",
              data: TINY_TEST_IMAGE_PNG_BASE64,
            },
          },
        ],
      },
    ],
  });

  writeFileSync(visionPath, vision.text, "utf8");
  log(`INFO vision HTTP ${vision.status}`);
  log(`INFO wrote ${visionPath}`);
  if (!vision.ok) {
    log("FAIL vision request was not successful");
    process.exitCode = 1;
  }

  const score = vision.json ? firstCandidateText(vision.json) : null;
  if (score) {
    log(`INFO vision candidate text ${JSON.stringify(score.slice(0, 200))}`);
  } else {
    log("WARN no candidates[0].content.parts[0].text found in vision response");
  }

  log("DONE google probe finished");
}

main().catch((error) => {
  log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
