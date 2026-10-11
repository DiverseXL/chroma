import type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";

export type RunStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "DEGRADED";

export type NodeStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED"
  | "REGENERATING";

export type NodeKind =
  | "PLAN"
  | "STYLE_ANALYSIS"
  | "PROMPT_COMPILE"
  | "IMAGE_GENERATE"
  | "IMAGE_EDIT"
  | "CONSISTENCY_CHECK"
  | "CRITIQUE"
  | "GATE"
  | "COMPOSE";

export type ArtifactKind = "IMAGE" | "JSON" | "TEXT";

export interface RunSummary {
  id: string;
  brief: string;
  status: RunStatus;
  createdAt: string;
}

export interface RunRecord extends RunSummary {
  completedAt: string | null;
  degraded: boolean;
}

export interface RunNode {
  id: string;
  runId: string;
  kind: NodeKind;
  status: NodeStatus;
  label: string;
  inputJson: unknown;
  outputJson: unknown | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  error?: string;
  progressPercent?: number;
}

export interface RunEdge {
  id: string;
  runId: string;
  fromNodeId: string;
  toNodeId: string;
  fromPort: string;
  toPort: string;
}

export interface RunArtifact {
  id: string;
  nodeId: string;
  kind: ArtifactKind;
  mimeType: string;
  sha256: string;
  width: number | null;
  height: number | null;
  metadata: unknown | null;
  createdAt: string;
}

export interface RunSnapshot {
  run: RunRecord;
  nodes: RunNode[];
  edges: RunEdge[];
  artifacts: RunArtifact[];
  latestSequence: number;
}

export interface RunEvent {
  id: string;
  runId: string;
  nodeId: string | null;
  type: string;
  payload: unknown;
  sequence: number;
  createdAt: string;
}

export interface ChromaNodeData extends Record<string, unknown> {
  node: RunNode;
  artifact: RunArtifact | null;
  runId: string | null;
  runStatus: RunStatus | null;
  hasUpstreamImageArtifact: boolean;
  selected: boolean;
  flash: boolean;
}

export type ChromaFlowNode = FlowNode<ChromaNodeData>;
export type ChromaFlowEdge = FlowEdge;

export type ConnectionStatus = "connected" | "reconnecting" | "closed";

export function isRunStatus(value: unknown): value is RunStatus {
  return (
    value === "PENDING" ||
    value === "RUNNING" ||
    value === "SUCCEEDED" ||
    value === "FAILED" ||
    value === "DEGRADED"
  );
}

export function isNodeStatus(value: unknown): value is NodeStatus {
  return (
    value === "PENDING" ||
    value === "READY" ||
    value === "RUNNING" ||
    value === "SUCCEEDED" ||
    value === "FAILED" ||
    value === "SKIPPED" ||
    value === "REGENERATING"
  );
}
