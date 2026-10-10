/**
 * End-to-end smoke test for the Chroma workflow execution engine.
 * Assumes `pnpm dev` is running on http://localhost:3000.
 */

import { stat } from "node:fs/promises";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

async function main() {
  console.log(`Connecting to Chroma dev server at ${BASE_URL}...`);

  // 1. Verify server reachability
  try {
    const probeRes = await fetch(BASE_URL, { signal: AbortSignal.timeout(20000) });
    if (!probeRes.ok && probeRes.status >= 500) {
      throw new Error(`Server returned status ${probeRes.status}`);
    }
  } catch (err) {
    console.error(
      `\nError: Cannot reach ${BASE_URL}. Ensure the development server is running via 'pnpm dev'.\nDetails:`,
      err.message,
    );
    console.log("SMOKE FAIL: Server not reachable at " + BASE_URL);
    process.exit(1);
  }

  // 2. POST to /api/runs
  console.log("Submitting run brief to /api/runs...");
  let runId;
  try {
    const postRes = await fetch(`${BASE_URL}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: process.env.BRIEF || "A neon cyberpunk cityscape with flying vehicles",
      }),
    });

    if (!postRes.ok) {
      const errText = await postRes.text();
      console.log(`SMOKE FAIL: /api/runs returned HTTP ${postRes.status} - ${errText}`);
      process.exit(1);
    }

    const postData = await postRes.json();
    runId = postData.runId;
    console.log(`Run launched successfully with runId: ${runId}`);
  } catch (err) {
    console.log(`SMOKE FAIL: POST /api/runs failed: ${err.message}`);
    process.exit(1);
  }

  // 3. Connect to SSE stream and track events
  console.log(`Connecting to SSE stream at /api/runs/${runId}/events...`);
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => {
    controller.abort();
    console.log("SMOKE FAIL: Timed out waiting for run.completed event after 180s");
    process.exit(1);
  }, 180000);

  try {
    const eventsRes = await fetch(`${BASE_URL}/api/runs/${runId}/events`, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });

    if (!eventsRes.ok) {
      clearTimeout(timeoutTimer);
      console.log(`SMOKE FAIL: SSE stream returned HTTP ${eventsRes.status}`);
      process.exit(1);
    }

    const reader = eventsRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let runCompleted = false;

    while (!runCompleted) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6));
            console.log(`[Event] type: ${event.type} | sequence: ${event.sequence} | node: ${event.nodeId ?? "none"}`);
            if (event.type === "run.completed") {
              runCompleted = true;
              break;
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    }

    clearTimeout(timeoutTimer);
    controller.abort(); // Close SSE stream cleanly
  } catch (err) {
    clearTimeout(timeoutTimer);
    if (!err.name === "AbortError") {
      console.log(`SMOKE FAIL: SSE stream error: ${err.message}`);
      process.exit(1);
    }
  }

  // 4. GET /api/runs/:id snapshot and assert results
  console.log(`Fetching final snapshot from /api/runs/${runId}...`);
  try {
    const snapRes = await fetch(`${BASE_URL}/api/runs/${runId}`);
    if (!snapRes.ok) {
      console.log(`SMOKE FAIL: GET /api/runs/${runId} returned HTTP ${snapRes.status}`);
      process.exit(1);
    }

    const snapshot = await snapRes.json();
    console.log(`Snapshot received. Run Status: ${snapshot.run?.status}, Nodes: ${snapshot.nodes?.length}, Artifacts: ${snapshot.artifacts?.length}`);

    if (!["SUCCEEDED", "DEGRADED"].includes(snapshot.run?.status)) {
      console.log(
        `SMOKE FAIL: Expected run.status to be 'SUCCEEDED' or 'DEGRADED', got '${snapshot.run?.status}'`,
      );
      process.exit(1);
    }

    if (!snapshot.nodes || snapshot.nodes.length < 5) {
      console.log(`SMOKE FAIL: Expected nodes.length >= 5, got ${snapshot.nodes?.length}`);
      process.exit(1);
    }

    const critiqueNodes = snapshot.nodes.filter(
      (node) =>
        node.kind === "CRITIQUE" &&
        typeof node.outputJson?.score === "number" &&
        Number.isFinite(node.outputJson.score),
    );
    if (critiqueNodes.length < 2) {
      console.log(
        `SMOKE FAIL: Expected at least 2 CRITIQUE nodes with numeric scores, got ${critiqueNodes.length}`,
      );
      process.exit(1);
    }

    const imageArtifacts = snapshot.artifacts.filter(
      (artifact) => artifact.kind === "IMAGE",
    );
    if (imageArtifacts.length < 2) {
      console.log(
        `SMOKE FAIL: Expected at least 2 IMAGE artifacts, got ${imageArtifacts.length}`,
      );
      process.exit(1);
    }

    for (const artifact of imageArtifacts.slice(0, 2)) {
      const file = await stat(artifact.storageKey);
      if (file.size <= 50000) {
        console.log(
          `SMOKE FAIL: IMAGE artifact ${artifact.id} is only ${file.size} bytes on disk`,
        );
        process.exit(1);
      }
      console.log(
        `IMAGE artifact ${artifact.id}: ${file.size} bytes on disk`,
      );
    }

    const artifactRes = await fetch(
      `${BASE_URL}/api/artifacts/${imageArtifacts[0].id}`,
    );
    const artifactBytes = await artifactRes.arrayBuffer();
    const contentType = artifactRes.headers.get("content-type");
    if (
      artifactRes.status !== 200 ||
      contentType !== "image/png" ||
      artifactBytes.byteLength <= 50000
    ) {
      console.log(
        `SMOKE FAIL: Artifact GET expected HTTP 200, image/png, >50000 bytes; got HTTP ${artifactRes.status}, ${contentType}, ${artifactBytes.byteLength} bytes`,
      );
      process.exit(1);
    }

    console.log("\nSMOKE PASS");
    process.exit(0);
  } catch (err) {
    console.log(`SMOKE FAIL: Snapshot assertion failed: ${err.message}`);
    process.exit(1);
  }
}

main();
