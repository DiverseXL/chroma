#!/usr/bin/env node
/**
 * Probe #2: Pollinations.ai
 *
 * Makes exactly one text-to-image call and saves the raw response bytes.
 *
 * Endpoint (confirmed from the current Pollinations API docs):
 *   Base URL https://gen.pollinations.ai
 *   GET /image/{prompt}
 *   Source: https://raw.githubusercontent.com/pollinations/pollinations/main/APIDOCS.md
 *   Source: https://gen.pollinations.ai/openapi.json
 *
 * Auth note: the current docs require a bearer key for image generation
 * ("Everything else | Bearer key required unless the endpoint documents
 * ?key= support"). This script therefore sends ?key= ONLY when
 * POLLINATIONS_API_KEY is present in the environment, and otherwise sends no
 * key at all so the probe can report exactly what the live API does.
 *
 * No API key is ever hardcoded. Prints status lines only.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE_URL = "https://gen.pollinations.ai";
const PROMPT = "A single blue circle on a white background.";

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

async function main() {
  loadEnv();

  const probeDir = path.join("docs", "probe");
  mkdirSync(probeDir, { recursive: true });

  const url = new URL(`${BASE_URL}/image/${encodeURIComponent(PROMPT)}`);
  const key = (process.env.POLLINATIONS_API_KEY || "").trim();
  if (key !== "") url.searchParams.set("key", key);

  log(`INFO endpoint ${BASE_URL}/image/{prompt}`);
  log(key !== "" ? "INFO sending API key via ?key=" : "INFO sending no API key");

  const response = await fetch(url, { method: "GET" });
  const contentType = response.headers.get("content-type") || "unknown";
  const bytes = Buffer.from(await response.arrayBuffer());

  const outPath = path.join(probeDir, "pollinations.png");
  writeFileSync(outPath, bytes);

  log(`INFO image generation HTTP ${response.status}`);
  log(`INFO content-type ${contentType}`);
  log(`INFO bytes ${bytes.length}`);
  log(`INFO wrote ${outPath}`);

  if (!response.ok) {
    log("FAIL image generation request was not successful");
    process.exitCode = 1;
  }

  log("DONE pollinations probe finished");
}

main().catch((error) => {
  log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
