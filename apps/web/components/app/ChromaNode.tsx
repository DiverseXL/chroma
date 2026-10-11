"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import Image from "next/image";
import type { ChromaFlowNode, NodeKind } from "@/lib/runTypes";

const statusColors: Record<string, string> = {
  PENDING: "var(--text-tertiary)",
  READY: "#3b82f6",
  RUNNING: "var(--amber)",
  SUCCEEDED: "var(--green)",
  FAILED: "var(--red)",
  SKIPPED: "var(--text-tertiary)",
  REGENERATING: "var(--purple)",
};

function NodeIcon({ kind }: { kind: NodeKind }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (kind) {
    case "PLAN":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>;
    case "STYLE_ANALYSIS":
      return <svg {...common}><path d="M12 3.5c-5 0-8.5 3.7-8.5 8.2 0 4 3 7 6.8 7h1.2a1.8 1.8 0 0 0 1.4-3c-.8-.9-.1-2.2 1.1-2.2h1.8c2.4 0 4.2-1.8 4.2-4.1 0-3.3-3.5-5.9-8-5.9Z" /><circle cx="8" cy="10" r=".8" fill="currentColor" /><circle cx="12" cy="7.5" r=".8" fill="currentColor" /><circle cx="16" cy="9" r=".8" fill="currentColor" /></svg>;
    case "PROMPT_COMPILE":
      return <svg {...common}><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h6" /></svg>;
    case "IMAGE_GENERATE":
      return <svg {...common}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="9.5" r="1.5" /><path d="m5 17 5-5 3 3 2-2 4 4" /></svg>;
    case "IMAGE_EDIT":
      return <svg {...common}><rect x="3.5" y="5" width="14.5" height="14" rx="2" /><circle cx="8.5" cy="9.5" r="1.2" /><path d="m5 16 4-4 2.5 2.5 2-2 3.5 3.5M18 3l.8 2.2L21 6l-2.2.8L18 9l-.8-2.2L15 6l2.2-.8L18 3Z" /></svg>;
    case "CONSISTENCY_CHECK":
      return <svg {...common}><rect x="4" y="4" width="12" height="12" rx="2" /><path d="M8 8h11v11H8zM11 13l2 2 4-4" /></svg>;
    case "CRITIQUE":
      return <svg {...common}><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L12 3.5Z" /></svg>;
    case "GATE":
      return <svg {...common}><path d="m12 3.5 8.5 8.5-8.5 8.5L3.5 12 12 3.5Z" /><path d="m9.5 12 1.7 1.7 3.5-3.5" /></svg>;
    case "COMPOSE":
      return <svg {...common}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>;
  }
}

function getScore(value: unknown): number | null {
  if (typeof value !== "object" || value === null || !("score" in value)) {
    return null;
  }
  const score = (value as { score?: unknown }).score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

interface NodeBadge {
  text: string;
  kind: "model" | "fallback" | "heuristic";
}

/**
 * Derives the small status badge shown in the node meta row:
 * - PLAN: the model that served the storyboard, or "fallback" when the
 *   model chain (or the planner itself) degraded.
 * - CRITIQUE: "heuristic" when the critic substituted a heuristic score
 *   because the vision provider was unavailable.
 */
function getNodeBadge(
  kind: NodeKind,
  outputJson: unknown,
): NodeBadge | null {
  if (typeof outputJson !== "object" || outputJson === null) {
    return null;
  }
  const meta = (outputJson as { metadata?: unknown }).metadata;
  if (typeof meta !== "object" || meta === null) {
    return null;
  }
  const record = meta as Record<string, unknown>;
  if (record.fallback === true) {
    return kind === "CRITIQUE"
      ? { text: "heuristic", kind: "heuristic" }
      : { text: "fallback", kind: "fallback" };
  }
  if (kind === "PLAN" && typeof record.model === "string" && record.model) {
    return { text: record.model, kind: "model" };
  }
  return null;
}

export function ChromaNode({ data }: NodeProps<ChromaFlowNode>) {
  const { node, artifact, selected, flash } = data;
  const score = getScore(node.outputJson);
  const badge = getNodeBadge(node.kind, node.outputJson);
  const isComposeImage = node.kind === "COMPOSE" && artifact?.kind === "IMAGE";

  return (
    <div
      className={`chroma-node${artifact?.kind === "IMAGE" ? " chroma-node--image" : ""}${isComposeImage ? " chroma-node--compose" : ""}`}
      data-status={node.status}
      data-selected={selected}
      data-flash={flash}
      style={{ "--node-status-color": statusColors[node.status] } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="chroma-node-handle" />
      <span className="chroma-node__glow" aria-hidden="true" />
      <div className="chroma-node__header">
        <span className="chroma-node__icon"><NodeIcon kind={node.kind} /></span>
        <span className="chroma-node__label" title={node.label}>{node.label}</span>
        {score !== null ? (
          <span
            className="chroma-node__score"
            data-score={score >= 0.7 ? "good" : score >= 0.4 ? "mid" : "low"}
          >
            {score.toFixed(2)}
          </span>
        ) : null}
      </div>
      <div className="chroma-node__meta">
        <span>{node.kind.replaceAll("_", " ")}</span>
        {node.attempts > 1 ? (
          <span>· attempt {node.attempts}/{node.maxAttempts}</span>
        ) : null}
        {badge ? (
          <span className="chroma-node__badge" data-kind={badge.kind}>
            {badge.text}
          </span>
        ) : null}
      </div>
      {typeof node.progressPercent === "number" ? (
        <div className="chroma-node__progress">
          <span style={{ width: `${Math.max(0, Math.min(100, node.progressPercent))}%` }} />
        </div>
      ) : null}
      {artifact?.kind === "IMAGE" ? (
        <Image
          className="chroma-node__thumbnail"
          src={`/api/artifacts/${encodeURIComponent(artifact.id)}`}
          alt={`${node.label} generated image`}
          draggable={false}
          width={isComposeImage ? 314 : 196}
          height={isComposeImage ? 200 : 100}
          unoptimized
        />
      ) : null}
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="chroma-node-handle" />
    </div>
  );
}
