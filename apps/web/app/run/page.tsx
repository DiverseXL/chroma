"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "@/components/app/Canvas";
import { Inspector } from "@/components/app/Inspector";
import { Sidebar } from "@/components/app/Sidebar";
import { useRunStream } from "@/lib/useRunStream";

type CanvasState = "steady" | "exiting" | "entering";

export default function RunPage() {
  const stream = useRunStream();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>("steady");
  const [recentRefreshKey, setRecentRefreshKey] = useState(0);

  const selectedNode = useMemo(
    () => stream.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, stream.nodes],
  );
  const selectedArtifact = useMemo(
    () =>
      selectedNode
        ? stream.artifacts
            .filter((artifact) => artifact.nodeId === selectedNode.id)
            .at(-1) ?? null
        : null,
    [selectedNode, stream.artifacts],
  );

  const startRun = useCallback(
    async (brief: string) => {
      stream.clearError();
      const runId = await stream.createRun(brief);
      window.history.replaceState(
        {},
        "",
        `/run?id=${encodeURIComponent(runId)}`,
      );
      setSelectedNodeId(null);
      setCanvasState("steady");
      setRecentRefreshKey((key) => key + 1);
    },
    [stream],
  );

  const selectRun = useCallback(
    async (runId: string) => {
      if (runId === stream.run?.id) return;
      setCanvasState("exiting");
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      setSelectedNodeId(null);
      try {
        await stream.loadRun(runId);
        window.history.replaceState(
          {},
          "",
          `/run?id=${encodeURIComponent(runId)}`,
        );
        setCanvasState("entering");
        window.setTimeout(() => setCanvasState("steady"), 420);
      } catch {
        setCanvasState("steady");
      }
    },
    [stream],
  );

  useEffect(() => {
    const runId = new URLSearchParams(window.location.search).get("id");
    if (!runId) return;
    void stream.loadRun(runId).catch(() => {
      setCanvasState("steady");
    });
    // Query-string loading is intentionally performed only on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.loadRun]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedNodeId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const runStatus = stream.run?.status;
  useEffect(() => {
    if (runStatus && runStatus !== "PENDING") {
      setRecentRefreshKey((key) => key + 1);
    }
  }, [runStatus]);

  return (
    <main className="run-layout">
      <Sidebar
        busy={stream.isBusy}
        connection={stream.connection}
        error={stream.error}
        runId={stream.run?.id ?? null}
        refreshKey={recentRefreshKey}
        onRun={startRun}
        onSelectRun={(runId) => void selectRun(runId)}
      />
      <section className="run-canvas-region" aria-label="Run visualization">
        {stream.run ? (
          <div className="canvas-run-heading">
            <span className="canvas-run-kicker">LIVE RUN</span>
            <span className="canvas-run-title">{stream.run.brief}</span>
            <span className="run-status-badge" data-status={stream.run.status}>
              {stream.run.status}
            </span>
          </div>
        ) : null}
        <Canvas
          nodes={stream.nodes}
          edges={stream.edges}
          artifacts={stream.artifacts}
          selectedNodeId={selectedNodeId}
          flashSucceeded={stream.flashSucceeded}
          state={canvasState}
          connection={stream.connection}
          onNodeSelect={setSelectedNodeId}
        />
        <Inspector
          node={selectedNode}
          artifact={selectedArtifact}
          onClose={() => setSelectedNodeId(null)}
        />
      </section>
    </main>
  );
}
