#!/usr/bin/env node
/**
 * Probe #1: Google Gemini API (Google AI Studio).
 *
 * Makes exactly two calls:
 *   1. one image-generation call (Nano Banana model id from env)
 *   2. one vision call scoring a hardcoded tiny PNG against a trivial rubric
 *
 * Writes:
 *   docs/probe/google-generate.json  raw response body
 *   docs/probe/google-generate.png   returned image bytes
 *   docs/probe/google-vision.json    raw response body
 *
 * REST endpoint (confirmed):
 *   https://ai.google.dev/gemini-api/docs/image-generation
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   header: x-goog-api-key
 *
 * Prints status lines only. No API key is ever hardcoded.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

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

/**
 * Locates `output_image.data` anywhere in the parsed response.
 * `output_image` and `data` are the field names documented at
 * https://ai.google.dev/gemini-api/docs/image-generation
 * The walk makes no assumption about the wrapper object around it.
 */
function findOutputImageData(node) {
  if (node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findOutputImageData(item);
      if (found) return found;
    }
    return null;
  }
  const candidate = node.output_image;
  if (
    candidate &&
    typeof candidate === "object" &&
    typeof candidate.data === "string"
  ) {
    return candidate.data;
  }
  for (const value of Object.values(node)) {
    const found = findOutputImageData(value);
    if (found) return found;
  }
  return null;
}

async function callInteractions(apiKey, body) {
  const response = await fetch(ENDPOINT, {
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

  return { status: response.status, ok: response.ok, text, json };
}

async function main() {
  loadEnv();

  const apiKey = requireEnv("GEMINI_API_KEY");
  const imageModel = requireEnv("GOOGLE_MODEL_NANO_BANANA");
  const visionModel = requireEnv("GOOGLE_MODEL_VISION");
  const probeDir = ensureProbeDir();

  log(`INFO endpoint ${ENDPOINT}`);
  log(`INFO image model ${imageModel}`);
  log(`INFO vision model ${visionModel}`);

  // --- Call 1: image generation -----------------------------------------
  const generatePath = path.join(probeDir, "google-generate.json");
  const generate = await callInteractions(apiKey, {
    model: imageModel,
    input: [{ type: "text", text: IMAGE_PROMPT }],
  });

  writeFileSync(generatePath, generate.text, "utf8");
  log(`INFO image generation HTTP ${generate.status}`);
  log(`INFO wrote ${generatePath}`);
  if (!generate.ok) {
    log("FAIL image generation request was not successful");
    process.exitCode = 1;
  }

  const base64Image = generate.json ? findOutputImageData(generate.json) : null;
  if (base64Image) {
    const imagePath = path.join(probeDir, "google-generate.png");
    writeFileSync(imagePath, Buffer.from(base64Image, "base64"));
    log(`INFO wrote ${imagePath}`);
  } else {
    log("WARN no output_image.data found in image generation response");
  }

  // --- Call 2: vision scoring -------------------------------------------
  const visionPath = path.join(probeDir, "google-vision.json");
  const vision = await callInteractions(apiKey, {
    model: visionModel,
    input: [
      { type: "text", text: VISION_RUBRIC },
      {
        type: "image",
        mime_type: "image/png",
        data: TINY_TEST_IMAGE_PNG_BASE64,
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

  log("DONE google probe finished");
}

main().catch((error) => {
  log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
