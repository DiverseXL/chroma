"use client";

import { useEffect, useState, type PointerEvent } from "react";
import type { RunSummary } from "@/lib/runTypes";

interface RecentRunsProps {
  selectedRunId: string | null;
  refreshKey: number;
  onSelect: (runId: string) => void;
}

function formatRelativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return "";
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function press(event: PointerEvent<HTMLButtonElement>) {
  event.currentTarget.dataset.pressed = "true";
}

function release(event: PointerEvent<HTMLButtonElement>) {
  delete event.currentTarget.dataset.pressed;
}

export function RecentRuns({
  selectedRunId,
  refreshKey,
  onSelect,
}: RecentRunsProps) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/runs", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load recent runs (${response.status}).`);
        }
        const result = (await response.json()) as { runs?: RunSummary[] };
        setRuns(Array.isArray(result.runs) ? result.runs : []);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError("Recent runs could not be loaded.");
      });
    return () => controller.abort();
  }, [refreshKey]);

  return (
    <section className="recent-runs" aria-labelledby="recent-runs-title">
      <h2 className="app-section-label" id="recent-runs-title">
        RECENT
      </h2>
      {error ? <p className="recent-runs-message">{error}</p> : null}
      {runs.length === 0 && !error ? (
        <p className="recent-runs-message">Your runs will appear here.</p>
      ) : null}
      <div className="recent-run-list">
        {runs.map((run) => (
          <button
            className="recent-run-item"
            type="button"
            key={run.id}
            data-selected={selectedRunId === run.id}
            onClick={() => onSelect(run.id)}
            onPointerDown={press}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
          >
            <span className="recent-run-brief">{run.brief}</span>
            <span className="recent-run-meta">
              <span
                className="run-status-badge"
                data-status={run.status}
              >
                {run.status}
              </span>
              <span>{formatRelativeTime(run.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
