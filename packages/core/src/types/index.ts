/**
 * Core domain types and enumerations for Chroma.
 */

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

export interface Run {
  id: string;
  brief: string;
  status: RunStatus;
  createdAt: Date | string;
  completedAt: Date | string | null;
  degraded: boolean;
}

export interface Node {
  id: string;
  runId: string;
  kind: NodeKind;
  status: NodeStatus;
  label: string;
  inputJson: unknown;
  outputJson: unknown | null;
  attempts: number;
  maxAttempts: number;
  createdAt: Date | string;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
}

export interface Edge {
  id: string;
  runId: string;
  fromNodeId: string;
  toNodeId: string;
  fromPort: string;
  toPort: string;
}

export interface Artifact {
  id: string;
  nodeId: string;
  kind: ArtifactKind;
  mimeType: string;
  storageKey: string;
  sha256: string;
  width: number | null;
  height: number | null;
  metadata: unknown | null;
  createdAt: Date | string;
}

export interface Event {
  id: string;
  runId: string;
  nodeId: string | null;
  type: string;
  payload: unknown;
  sequence: number;
  createdAt: Date | string;
}

export interface NodeSpec {
  id: string;
  kind: NodeKind;
  label: string;
  inputs: Record<string, string>;
  outputs: string[];
}

export interface EdgeSpec {
  from: string;
  to: string;
  fromPort: string;
  toPort: string;
}

export interface GraphSpec {
  nodes: NodeSpec[];
  edges: EdgeSpec[];
}
