"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import Image from "next/image";
import type { RunArtifact, RunNode, RunStatus } from "@/lib/runTypes";

type InspectorTab = "input" | "output" | "artifact";

interface InspectorProps {
  node: RunNode | null;
  artifact: RunArtifact | null;
  runId: string | null;
  runStatus: RunStatus | null;
  onClose: () => void;
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "No data yet.";
  return JSON.stringify(value, null, 2);
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function press(event: PointerEvent<HTMLButtonElement>) {
  event.currentTarget.dataset.pressed = "true";
}

function release(event: PointerEvent<HTMLButtonElement>) {
  delete event.currentTarget.dataset.pressed;
}

export function Inspector({
  node,
  artifact,
  runId,
  runStatus,
  onClose,
}: InspectorProps) {
  const panelRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<InspectorTab>("input");
  const open = node !== null;
  const canDownload =
    node?.kind === "COMPOSE" &&
    runId !== null &&
    (runStatus === "SUCCEEDED" || runStatus === "DEGRADED");

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.setProperty("--inspector-x", open ? "0%" : "100%");
    panel.style.setProperty("--inspector-y", open ? "0%" : "100%");
  }, [open, node?.id]);

  useEffect(() => {
    setTab("input");
  }, [node?.id]);

  return (
    <aside
      ref={panelRef}
      className="run-inspector"
      data-open={open}
      aria-hidden={!open}
      inert={!open}
      aria-label="Node inspector"
    >
      {node ? (
        <div className="inspector-inner">
          <div className="inspector-topline">
            <span className="inspector-kind">{node.kind.replaceAll("_", " ")}</span>
            <button
              className="inspector-close"
              type="button"
              aria-label="Close inspector"
              onClick={onClose}
              onPointerDown={press}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <h2 className="inspector-title">{node.label}</h2>
          <div className="inspector-status-row">
            <span className="run-status-badge" data-status={node.status}>{node.status}</span>
            <span className="inspector-timing">
              {formatTime(node.startedAt)} → {formatTime(node.endedAt)}
            </span>
          </div>
          {canDownload ? (
            <a
              className="button button-primary inspector-download"
              href={`/api/runs/${encodeURIComponent(runId)}/download`}
              download
            >
              Download panel set (.zip)
            </a>
          ) : null}
          <div className="inspector-tabs" role="tablist" aria-label="Node details">
            {(["input", "output", "artifact"] as const).map((name) => (
              <button
                className="inspector-tab"
                type="button"
                role="tab"
                aria-selected={tab === name}
                key={name}
                onClick={() => setTab(name)}
                onPointerDown={press}
                onPointerUp={release}
                onPointerLeave={release}
                onPointerCancel={release}
              >
                {name[0].toUpperCase() + name.slice(1)}
              </button>
            ))}
            <span className="inspector-tab-indicator" data-tab={tab} />
          </div>
          {tab === "input" ? (
            <pre className="inspector-json">{formatJson(node.inputJson)}</pre>
          ) : null}
          {tab === "output" ? (
            <pre className="inspector-json">{formatJson(node.outputJson)}</pre>
          ) : null}
          {tab === "artifact" ? (
            <div className="inspector-artifact">
              {artifact?.kind === "IMAGE" ? (
                <>
                  <Image
                    src={`/api/artifacts/${encodeURIComponent(artifact.id)}`}
                    alt={`${node.label} artifact`}
                    width={artifact.width ?? 340}
                    height={artifact.height ?? 240}
                    unoptimized
                  />
                  <dl className="artifact-details">
                    <div><dt>Type</dt><dd>{artifact.mimeType}</dd></div>
                    <div><dt>Dimensions</dt><dd>{artifact.width ?? "—"} × {artifact.height ?? "—"}</dd></div>
                    <div><dt>SHA-256</dt><dd title={artifact.sha256}>{artifact.sha256.slice(0, 16)}…</dd></div>
                  </dl>
                </>
              ) : (
                <p className="inspector-empty">No artifact for this node yet.</p>
              )}
            </div>
          ) : null}
          {node.status === "FAILED" && node.error ? (
            <div className="inspector-error">
              <span className="inspector-error-label">ERROR</span>
              <p>{node.error}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
