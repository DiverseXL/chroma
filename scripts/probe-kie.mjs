#!/usr/bin/env node
/**
 * Probe #3: KIE AI image generation.
 *
 * KIE's image API is asynchronous (confirmed live at
 * https://docs.kie.ai/getting-started.md section 7): a 200 only means the
 * task was created. So ONE generation = exactly one createTask call, then
 * status polls on that same task. No second generation is ever started.
 *
 *   1. POST https://api.kie.ai/api/v1/jobs/createTask
 *        headers: Authorization: Bearer, Content-Type: application/json
 *        body:    { "model": <KIE_MODEL>, "input": { "prompt": ... } }
 *        returns: { "code": 200, "msg": "success", "data": { "taskId": "..." } }
 *   2. GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...
 *        data.state: waiting | queuing | generating | success | fail
 *        on success, data.resultJson (JSON string) parses to
 *        { "resultUrls": ["https://..."] } - the image URL lives there.
 *        Source: https://docs.kie.ai/market/common/get-task-detail.md
 *
 * IMPORTANT: on /api/v1/* endpoints, KIE may return errors as HTTP 200 with an
 * error "code" in the body (https://docs.kie.ai/getting-started.md section 4),
 * so this script checks the body code, not just the HTTP status.
 *
 * Writes:
 *   docs/probe/kie-generate.json  raw final recordInfo body (or the raw
 *                                 createTask body if creation failed)
 *   docs/probe/kie-generate.png   downloaded image bytes (saved as .png per
 *                                 probe convention; the bytes may be JPEG -
 *                                 the content-type is logged)
 *
 * Polling follows the documented guidance: "Start with 2-3 second intervals,
 * increase gradually" (https://docs.kie.ai/market/common/get-task-detail.md).
 *
 * Prints status lines only. No API key is ever hardcoded.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const IMAGE_PROMPT = "A single blue circle on a white background.";

const POLL_INITIAL_MS = 2500;
const POLL_MAX_MS = 10000;
const POLL_BACKOFF = 1.5;
const POLL_TIMEOUT_MS = 6 * 60 * 1000;

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

function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    log(`FAIL ${name} is not set.${hint ? ` ${hint}` : ""}`);
    process.exit(1);
  }
  return value.trim();
}

function ensureProbeDir() {
  const dir = path.join("docs", "probe");
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    console.error("FETCH ERROR NAME:", err.name);
    console.error("FETCH ERROR MESSAGE:", err.message);
    console.error("FETCH ERROR CAUSE:", err.cause);
    if (err.cause) {
      console.error("CAUSE CODE:", err.cause.code);
      console.error("CAUSE ERRNO:", err.cause.errno);
      console.error("CAUSE SYSCALL:", err.cause.syscall);
      console.error("CAUSE HOSTNAME:", err.cause.hostname);
    }
    throw err;
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Leave json null; the raw text is still available.
  }
  return { url, status: response.status, ok: response.ok, text, json };
}

async function createTask(baseUrl, apiKey, model) {
  return request(`${baseUrl}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: { prompt: IMAGE_PROMPT },
    }),
  });
}

async function getTask(baseUrl, apiKey, taskId) {
  const url = `${baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
  return request(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

/**
 * KIE returns image URLs, not base64. resultJson is a JSON string whose
 * parsed form is { resultUrls: [...] } for image tasks.
 */
function firstResultUrl(recordJson) {
  const raw = recordJson?.data?.resultJson;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    const urls = parsed?.resultUrls;
    if (Array.isArray(urls) && typeof urls[0] === "string") return urls[0];
  } catch {
    // Fall through.
  }
  return null;
}

async function downloadImage(imageUrl) {
  return request(imageUrl, { method: "GET" });
}

/**
 * Fallback for when a tempfile result URL is not directly fetchable:
 * POST /api/v1/common/download-url converts a kie.ai-generated file URL into
 * a temporary download link valid for 20 minutes.
 * Source: https://docs.kie.ai/common-api/quickstart.md
 */
async function resolveDownloadUrl(baseUrl, apiKey, imageUrl) {
  const response = await request(`${baseUrl}/api/v1/common/download-url`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: imageUrl }),
  });
  const data = response.json?.data;
  return typeof data === "string" ? data : null;
}

async function main() {
  loadEnv();

  const apiKey = requireEnv("KIE_API_KEY", "Get one at https://kie.ai/api-key.");
  const baseUrl = requireEnv(
    "KIE_BASE_URL",
    "Documented value: https://api.kie.ai (https://docs.kie.ai/common-api/quickstart.md).",
  ).replace(/\/+$/, "");
  const model = requireEnv(
    "KIE_MODEL",
    "Confirmed examples: nano-banana-2 (8 credits at 1K) or gpt-image-2-text-to-image (6 credits at 1K).",
  );
  const probeDir = ensureProbeDir();

  log(`INFO model ${model}`);
  log(`INFO create endpoint ${baseUrl}/api/v1/jobs/createTask`);
  log(`INFO poll endpoint ${baseUrl}/api/v1/jobs/recordInfo?taskId=...`);

  // --- Step 1: create exactly one generation task --------------------------
  const createPath = path.join(probeDir, "kie-generate.json");
  const created = await createTask(baseUrl, apiKey, model);
  log(`INFO createTask HTTP ${created.status}`);

  const createCode = created.json?.code;
  const taskId = created.json?.data?.taskId;
  if (!created.ok || createCode !== 200 || typeof taskId !== "string") {
    writeFileSync(createPath, created.text, "utf8");
    log(`INFO wrote ${createPath}`);
    log(
      `FAIL task not created (http ${created.status}, body code ${createCode ?? "unparseable"}, msg ${created.json?.msg ?? "unparseable"})`,
    );
    process.exit(1);
  }
  log(`INFO taskId ${taskId}`);

  // --- Step 2: poll the same task until success/fail -----------------------
  const pollPath = createPath; // final recordInfo body overwrites this file
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let interval = POLL_INITIAL_MS;
  let lastState = "";
  let finalText = null;
  let finalJson = null;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    interval = Math.min(interval * POLL_BACKOFF, POLL_MAX_MS);

    const polled = await getTask(baseUrl, apiKey, taskId);

    if (polled.json && typeof polled.json.code === "number" && polled.json.code !== 200) {
      log(`WARN recordInfo body code ${polled.json.code} msg ${polled.json.msg}`);
      if (polled.json.code === 401 || polled.json.code === 402) {
        writeFileSync(pollPath, polled.text, "utf8");
        log(`INFO wrote ${pollPath}`);
        log(`FAIL recordInfo rejected with body code ${polled.json.code}`);
        process.exit(1);
      }
      continue; // e.g. 429 while polling; back off and retry until deadline
    }

    finalText = polled.text;
    finalJson = polled.json;
    writeFileSync(pollPath, polled.text, "utf8");

    const state = polled.json?.data?.state;
    if (typeof state === "string" && state !== lastState) {
      log(`INFO state ${state}`);
      lastState = state;
    }

    if (state === "success") break;
    if (state === "fail") {
      log(`INFO wrote ${pollPath}`);
      log(
        `FAIL task failed failCode ${polled.json?.data?.failCode ?? "?"} failMsg ${polled.json?.data?.failMsg ?? "?"}`,
      );
      process.exit(1);
    }
  }

  if (!finalText) {
    log("FAIL no recordInfo response received before timeout");
    process.exit(1);
  }
  log(`INFO wrote ${pollPath}`);

  if (finalJson?.data?.state !== "success") {
    log(`FAIL timed out after ${POLL_TIMEOUT_MS / 1000}s; last state ${lastState || "unknown"}`);
    process.exit(1);
  }

  const credits = finalJson?.data?.creditsConsumed;
  log(`INFO creditsConsumed ${credits ?? "unreported"}`);

  // --- Step 3: download the image ------------------------------------------
  const imageUrl = firstResultUrl(finalJson);
  if (!imageUrl) {
    log("WARN no resultUrls[0] found in data.resultJson");
    log("DONE kie probe finished (task succeeded, no image URL found)");
    return;
  }
  log(`INFO resultUrl ${imageUrl}`);

  const downloaded = await downloadImage(imageUrl);
  let bytes = null;
  let contentType = null;

  if (downloaded.ok) {
    bytes = Buffer.from(downloaded.text, "binary");
    contentType = downloaded.headers?.get?.("content-type") ?? null;
    log(`INFO direct download HTTP ${downloaded.status}`);
  } else {
    log(`WARN direct download HTTP ${downloaded.status}; trying download-url endpoint`);
    const temporaryUrl = await resolveDownloadUrl(baseUrl, apiKey, imageUrl);
    if (!temporaryUrl) {
      log("FAIL download-url endpoint did not return a URL");
      log("DONE kie probe finished (generation succeeded, image not downloaded)");
      process.exit(1);
    }
    const viaLink = await downloadImage(temporaryUrl);
    if (!viaLink.ok) {
      log(`FAIL download-url fetch HTTP ${viaLink.status}`);
      log("DONE kie probe finished (generation succeeded, image not downloaded)");
      process.exit(1);
    }
    bytes = Buffer.from(viaLink.text, "binary");
    contentType = viaLink.headers?.get?.("content-type") ?? null;
    log(`INFO download-url fetch HTTP ${viaLink.status}`);
  }

  const imagePath = path.join(probeDir, "kie-generate.png");
  writeFileSync(imagePath, bytes);
  log(`INFO wrote ${imagePath} (${bytes.length} bytes, content-type ${contentType ?? "unknown"})`);
  if (contentType && !contentType.includes("png")) {
    log(`WARN content-type is ${contentType} but the file is named .png (bytes saved verbatim)`);
  }

  log("DONE kie probe finished");
}

main().catch((error) => {
  log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
