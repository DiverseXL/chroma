#!/usr/bin/env node
/**
 * Probe #2: Pollinations.ai
 *
 * Makes exactly one text-to-image call and saves the raw response bytes.
 *
 * Endpoint used here:
 *   GET https://image.pollinations.ai/prompt/{prompt}
 *     ?width=1024&height=1024&model=flux&nologo=true
 *
 * !! UNVERIFIED - CONFLICTS WITH CURRENT DOCS !!
 * This is the legacy Pollinations surface. It is documented ONLY on the stale
 * `master` branch:
 *   https://raw.githubusercontent.com/pollinations/pollinations/master/APIDOCS.md
 *     - "Endpoint: GET https://image.pollinations.ai/prompt/{prompt}"
 *     - parameter table: prompt, model (default flux), width (default 1024),
 *       height (default 1024), seed, nologo ("Remove the Pollinations
 *       watermark (needs account)"), enhance, private
 *     - "You can use Pollinations.AI without signing up"
 *
 * The CURRENT docs (default `main` branch + the served OpenAPI document) say
 * the opposite:
 *   - base URL is https://gen.pollinations.ai, endpoint GET /image/{prompt}
 *   - "Get an API key"; "Everything else | Bearer key required"
 *   - the string `nologo` occurs ZERO times in main/APIDOCS.md
 *   Source: https://raw.githubusercontent.com/pollinations/pollinations/main/APIDOCS.md
 *   Source: https://gen.pollinations.ai/openapi.json
 *
 * Please confirm which surface is authoritative. See U2/U6 in
 * docs/provider-facts.md.
 *
 * No API key is hardcoded and no auth header is sent. Prints status lines only.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE_URL = "https://image.pollinations.ai/prompt";
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

  const url = new URL(`${BASE_URL}/${encodeURIComponent(PROMPT)}`);
  // Parameters documented on the stale master-branch APIDOCS.md parameter
  // table. `nologo` is UNVERIFIED against current docs.
  url.searchParams.set("width", "1024");
  url.searchParams.set("height", "1024");
  url.searchParams.set("model", "flux");
  url.searchParams.set("nologo", "true");

  log(`INFO endpoint ${BASE_URL}/{prompt}`);
  log("INFO sending no API key");

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
