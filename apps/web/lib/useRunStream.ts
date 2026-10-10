"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  isNodeStatus,
  isRunStatus,
  type ConnectionStatus,
  type RunArtifact,
  type RunEdge,
  type RunEvent,
  type RunNode,
  type RunRecord,
  type RunSnapshot,
  type RunStatus,
} from "./runTypes";

interface RunStreamState {
  run: RunRecord | null;
  nodes: RunNode[];
  edges: RunEdge[];
  artifacts: RunArtifact[];
  connection: ConnectionStatus;
  lastSequence: number;
  flashSucceeded: boolean;
  error: string | null;
}

type Action =
  | { type: "reset" }
  | { type: "snapshot"; snapshot: RunSnapshot }
  | { type: "event"; event: RunEvent }
  | { type: "connection"; status: ConnectionStatus }
  | { type: "error"; message: string }
  | { type: "clear-error" }
  | { type: "clear-flash" };

const initialState: RunStreamState = {
  run: null,
  nodes: [],
  edges: [],
  artifacts: [],
  connection: "closed",
  lastSequence: 0,
  flashSucceeded: false,
  error: null,
};

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function reducer(state: RunStreamState, action: Action): RunStreamState {
  if (action.type === "reset") return initialState;
  if (action.type === "connection") {
    return { ...state, connection: action.status };
  }
  if (action.type === "error") {
    return { ...state, error: action.message };
  }
  if (action.type === "clear-error") {
    return { ...state, error: null };
  }
  if (action.type === "clear-flash") {
    return { ...state, flashSucceeded: false };
  }
  if (action.type === "snapshot") {
    if (action.snapshot.latestSequence < state.lastSequence) return state;
    return {
      ...state,
      run: action.snapshot.run,
      nodes: action.snapshot.nodes,
      edges: action.snapshot.edges,
      artifacts: action.snapshot.artifacts,
      lastSequence: action.snapshot.latestSequence,
      error: null,
    };
  }

  const { event } = action;
  if (event.sequence <= state.lastSequence) return state;
  const payload = asObject(event.payload);
  let next: RunStreamState = {
    ...state,
    lastSequence: Math.max(state.lastSequence, event.sequence),
  };

  switch (event.type) {
    case "run.created": {
      const run = payload as unknown as RunRecord | null;
      if (run && typeof run.id === "string" && isRunStatus(run.status)) {
        next = { ...next, run };
      }
      break;
    }
    case "node.created": {
      const node = payload as unknown as RunNode | null;
      if (node && typeof node.id === "string") {
        next = {
          ...next,
          nodes: [...next.nodes.filter((item) => item.id !== node.id), node],
        };
      }
      break;
    }
    case "edge.created": {
      const edge = payload as unknown as RunEdge | null;
      if (edge && typeof edge.id === "string") {
        next = {
          ...next,
          edges: [...next.edges.filter((item) => item.id !== edge.id), edge],
        };
      }
      break;
    }
    case "node.status": {
      const status = payload?.status;
      if (event.nodeId && isNodeStatus(status)) {
        next = {
          ...next,
          nodes: next.nodes.map((node) =>
            node.id === event.nodeId ? { ...node, status } : node,
          ),
        };
      }
      break;
    }
    case "node.started": {
      if (event.nodeId) {
        next = {
          ...next,
          run: next.run ? { ...next.run, status: "RUNNING" } : next.run,
          nodes: next.nodes.map((node) =>
            node.id === event.nodeId
              ? {
                  ...node,
                  status: "RUNNING",
                  startedAt: event.createdAt,
                  maxAttempts:
                    typeof payload?.maxAttempts === "number"
                      ? payload.maxAttempts
                      : node.maxAttempts,
                }
              : node,
          ),
        };
      }
      break;
    }
    case "node.progress": {
      const progress =
        typeof payload?.progressPercent === "number"
          ? payload.progressPercent
          : typeof payload?.progress === "number"
            ? payload.progress
            : null;
      if (event.nodeId && progress !== null) {
        next = {
          ...next,
          nodes: next.nodes.map((node) =>
            node.id === event.nodeId
              ? { ...node, progressPercent: progress }
              : node,
          ),
        };
      }
      break;
    }
    case "node.artifact":
      break;
    case "node.failed": {
      if (event.nodeId) {
        next = {
          ...next,
          nodes: next.nodes.map((node) =>
            node.id === event.nodeId
              ? {
                  ...node,
                  status: "FAILED",
                  error:
                    typeof payload?.error === "string"
                      ? payload.error
                      : "Node failed.",
                }
              : node,
          ),
        };
      }
      break;
    }
    case "node.regenerating": {
      const targetNodeId = payload?.targetNodeId;
      next = {
        ...next,
        nodes: next.nodes.map((node) =>
          node.id === event.nodeId || node.id === targetNodeId
            ? { ...node, status: "REGENERATING" }
            : node,
        ),
      };
      break;
    }
    case "run.completed": {
      const status: RunStatus = isRunStatus(payload?.status)
        ? payload.status
        : "SUCCEEDED";
      next = {
        ...next,
        run: next.run
          ? { ...next.run, status, completedAt: event.createdAt }
          : next.run,
        connection: "closed",
        flashSucceeded: true,
      };
      break;
    }
  }

  return next;
}

async function fetchSnapshot(runId: string): Promise<RunSnapshot> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
  if (!response.ok) {
    throw new Error(`Could not load run (${response.status}).`);
  }
  return (await response.json()) as RunSnapshot;
}

function isTerminal(status: RunStatus): boolean {
  return status === "SUCCEEDED" || status === "FAILED" || status === "DEGRADED";
}

export function useRunStream() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const lastSequenceRef = useRef(0);
  const knownNodeIdsRef = useRef(new Set<string>());
  const retriesRef = useRef(0);
  const connectRef = useRef<(runId: string, from: number) => void>(() => {});
  const refreshRef = useRef<(runId: string) => Promise<void>>(async () => {});

  const closeStream = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const refreshSnapshot = useCallback(async (runId: string) => {
    const snapshot = await fetchSnapshot(runId);
    if (activeRunIdRef.current !== runId) return;
    lastSequenceRef.current = Math.max(
      lastSequenceRef.current,
      snapshot.latestSequence,
    );
    knownNodeIdsRef.current = new Set(snapshot.nodes.map((node) => node.id));
    dispatch({ type: "snapshot", snapshot });
  }, []);
  refreshRef.current = refreshSnapshot;

  const connect = useCallback(
    (runId: string, from: number) => {
      if (activeRunIdRef.current !== runId) return;
      sourceRef.current?.close();
      const source = new EventSource(
        `/api/runs/${encodeURIComponent(runId)}/events?from=${Math.max(from, lastSequenceRef.current)}`,
      );
      sourceRef.current = source;

      source.onopen = () => {
        if (sourceRef.current !== source) return;
        retriesRef.current = 0;
        dispatch({ type: "connection", status: "connected" });
        dispatch({ type: "clear-error" });
      };

      source.onmessage = (message) => {
        if (sourceRef.current !== source) return;
        let event: RunEvent;
        try {
          event = JSON.parse(message.data) as RunEvent;
        } catch {
          dispatch({ type: "error", message: "Received an invalid run event." });
          return;
        }
        if (
          event.runId !== runId ||
          !Number.isFinite(event.sequence) ||
          event.sequence <= lastSequenceRef.current
        ) {
          return;
        }

        lastSequenceRef.current = Math.max(
          lastSequenceRef.current,
          event.sequence,
        );
        dispatch({ type: "event", event });

        if (event.type === "node.created" && event.payload) {
          const node = event.payload as RunNode;
          if (typeof node.id === "string") knownNodeIdsRef.current.add(node.id);
        }
        if (
          event.type === "node.artifact" ||
          event.type === "node.regenerating" ||
          (event.type === "node.started" &&
            event.nodeId !== null &&
            !knownNodeIdsRef.current.has(event.nodeId))
        ) {
          void refreshRef.current(runId).catch(() => {
            dispatch({
              type: "error",
              message: "Could not refresh run details after an event.",
            });
          });
        }
        if (event.type === "run.completed") {
          source.close();
          sourceRef.current = null;
          if (flashTimerRef.current !== null) {
            window.clearTimeout(flashTimerRef.current);
          }
          flashTimerRef.current = window.setTimeout(() => {
            dispatch({ type: "clear-flash" });
            flashTimerRef.current = null;
          }, 220);
        }
      };

      source.onerror = () => {
        if (sourceRef.current !== source) return;
        source.close();
        sourceRef.current = null;
        const attempt = retriesRef.current + 1;
        retriesRef.current = attempt;
        if (attempt >= 5) {
          dispatch({ type: "connection", status: "closed" });
          dispatch({
            type: "error",
            message: "The live connection closed after five attempts.",
          });
          return;
        }

        dispatch({ type: "connection", status: "reconnecting" });
        const delay = Math.min(8000, 1000 * 2 ** (attempt - 1));
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          void refreshRef.current(runId).then(
            () => {
              if (activeRunIdRef.current === runId) {
                connectRef.current(runId, lastSequenceRef.current);
              }
            },
            () => {
              if (activeRunIdRef.current === runId) {
                dispatch({
                  type: "error",
                  message: "Could not refresh the run before reconnecting.",
                });
                connectRef.current(runId, lastSequenceRef.current);
              }
            },
          );
        }, delay);
      };
    },
    [],
  );
  connectRef.current = connect;

  const beginRun = useCallback(
    (runId: string) => {
      closeStream();
      activeRunIdRef.current = runId;
      lastSequenceRef.current = 0;
      knownNodeIdsRef.current.clear();
      retriesRef.current = 0;
      dispatch({ type: "reset" });
      dispatch({ type: "connection", status: "reconnecting" });
      connectRef.current(runId, 0);
    },
    [closeStream],
  );

  const createRun = useCallback(
    async (brief: string) => {
      closeStream();
      activeRunIdRef.current = null;
      dispatch({ type: "reset" });
      try {
        const response = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief }),
        });
        if (!response.ok) {
          throw new Error(`Could not start the run (${response.status}).`);
        }
        const result = (await response.json()) as { runId?: unknown };
        if (typeof result.runId !== "string" || result.runId.length === 0) {
          throw new Error("The run endpoint did not return a runId.");
        }
        beginRun(result.runId);
        return result.runId;
      } catch (cause) {
        dispatch({
          type: "error",
          message:
            cause instanceof Error ? cause.message : "Could not start the run.",
        });
        throw cause;
      }
    },
    [beginRun, closeStream],
  );

  const loadRun = useCallback(
    async (runId: string) => {
      closeStream();
      activeRunIdRef.current = runId;
      lastSequenceRef.current = 0;
      knownNodeIdsRef.current.clear();
      retriesRef.current = 0;
      dispatch({ type: "connection", status: "reconnecting" });
      try {
        const snapshot = await fetchSnapshot(runId);
        if (activeRunIdRef.current !== runId) return;
        lastSequenceRef.current = snapshot.latestSequence;
        knownNodeIdsRef.current = new Set(snapshot.nodes.map((node) => node.id));
        dispatch({ type: "snapshot", snapshot });
        connectRef.current(runId, snapshot.latestSequence);
      } catch (cause) {
        dispatch({
          type: "connection",
          status: "closed",
        });
        dispatch({
          type: "error",
          message:
            cause instanceof Error ? cause.message : "Could not load the run.",
        });
        throw cause;
      }
    },
    [closeStream],
  );

  const clearError = useCallback(() => dispatch({ type: "clear-error" }), []);

  useEffect(() => {
    return () => {
      activeRunIdRef.current = null;
      closeStream();
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, [closeStream]);

  useEffect(() => {
    if (state.run && isTerminal(state.run.status) && state.connection !== "closed") {
      dispatch({ type: "connection", status: "closed" });
    }
  }, [state.connection, state.run]);

  return {
    ...state,
    isBusy: state.run?.status === "PENDING" || state.run?.status === "RUNNING",
    createRun,
    loadRun,
    clearError,
  };
}
