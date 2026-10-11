"use client";

import { useState, type FormEvent, type PointerEvent } from "react";
import { ConnectionDot } from "./ConnectionDot";
import { DEMO_RUN_HINT } from "@/lib/demoRun";
import type { ConnectionStatus } from "@/lib/runTypes";

interface BriefInputProps {
  busy: boolean;
  connection: ConnectionStatus;
  error: string | null;
  /** True while a cached demo run is open: the Run button is disabled. */
  demoMode?: boolean;
  onRun: (brief: string) => Promise<void>;
}

function pressed(event: PointerEvent<HTMLButtonElement>) {
  event.currentTarget.dataset.pressed = "true";
}

function released(event: PointerEvent<HTMLButtonElement>) {
  delete event.currentTarget.dataset.pressed;
}

export function BriefInput({
  busy,
  connection,
  error,
  demoMode,
  onRun,
}: BriefInputProps) {
  const [brief, setBrief] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || busy || demoMode || !brief.trim()) return;
    setSubmitting(true);
    try {
      await onRun(brief.trim());
    } catch {
      // The run hook exposes request errors inline beside the connection state.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="brief-form" onSubmit={submit}>
      <label className="app-section-label" htmlFor="run-brief">
        BRIEF
      </label>
      <textarea
        id="run-brief"
        className="brief-textarea"
        rows={6}
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        placeholder="A 4-panel cinematic storyboard of a lone astronaut in a glowing bioluminescent forest at dusk."
      />
      <button
        className="run-button"
        type="submit"
        disabled={busy || submitting || demoMode || !brief.trim()}
        title={demoMode ? DEMO_RUN_HINT : undefined}
        onPointerDown={pressed}
        onPointerUp={released}
        onPointerLeave={released}
        onPointerCancel={released}
      >
        {submitting ? "Starting…" : busy ? "Run in progress" : "Run"}
      </button>
      {demoMode ? (
        <p className="run-demo-hint" role="status">
          {DEMO_RUN_HINT}
        </p>
      ) : null}
      <div className="run-connection-row">
        <ConnectionDot status={connection} />
      </div>
      {error ? (
        <p className="run-inline-error" role="status">
          {error}
        </p>
      ) : null}
    </form>
  );
}
