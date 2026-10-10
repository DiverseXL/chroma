/**
 * End-to-end smoke test for the Chroma workflow execution engine.
 * Assumes `pnpm dev` is running on http://localhost:3000.
 */

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
      body: JSON.stringify({ brief: "A neon cyberpunk cityscape with flying vehicles" }),
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
    console.log("SMOKE FAIL: Timed out waiting for run.completed event after 30s");
    process.exit(1);
  }, 30000);

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

    if (snapshot.run?.status !== "SUCCEEDED") {
      console.log(`SMOKE FAIL: Expected run.status === 'SUCCEEDED', got '${snapshot.run?.status}'`);
      process.exit(1);
    }

    if (!snapshot.nodes || snapshot.nodes.length < 5) {
      console.log(`SMOKE FAIL: Expected nodes.length >= 5, got ${snapshot.nodes?.length}`);
      process.exit(1);
    }

    const hasImageArtifact = snapshot.artifacts?.some((a) => a.kind === "IMAGE");
    if (!hasImageArtifact) {
      console.log("SMOKE FAIL: Expected at least one artifact of kind 'IMAGE'");
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
