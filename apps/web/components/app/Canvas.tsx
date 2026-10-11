"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { layoutGraph } from "@/lib/layout";
import type {
  ChromaFlowEdge,
  ChromaFlowNode,
  ConnectionStatus,
  RunArtifact,
  RunEdge,
  RunNode,
  RunStatus,
} from "@/lib/runTypes";
import { ChromaNode } from "./ChromaNode";

const nodeTypes = { chroma: ChromaNode };

interface CanvasProps {
  nodes: RunNode[];
  edges: RunEdge[];
  artifacts: RunArtifact[];
  runId: string | null;
  runStatus: RunStatus | null;
  selectedNodeId: string | null;
  flashSucceeded: boolean;
  state: "steady" | "exiting" | "entering";
  connection: ConnectionStatus;
  onNodeSelect: (nodeId: string) => void;
}

function statusColor(node: ChromaFlowNode) {
  const status = node.data.node.status as string;
  switch (status) {
    case "READY": return "#3b82f6";
    case "RUNNING": return "#f59e0b";
    case "SUCCEEDED": return "#22c55e";
    case "FAILED": return "#ef4444";
    case "REGENERATING": return "#a855f7";
    default: return "#6b6b6b";
  }
}

function CanvasFlow({
  nodes: runNodes,
  edges: runEdges,
  artifacts,
  runId,
  runStatus,
  selectedNodeId,
  flashSucceeded,
  state,
  connection,
  onNodeSelect,
}: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<ChromaFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ChromaFlowEdge>([]);
  const { fitView } = useReactFlow();
  const previousPositionsRef = useRef(new Map<string, { x: number; y: number }>());
  const previousNodeIdsRef = useRef(new Set<string>());

  const nextNodes = useMemo<ChromaFlowNode[]>(() => {
    return runNodes.map((node) => {
      const artifact =
        artifacts
          .filter((item) => item.nodeId === node.id && item.kind === "IMAGE")
          .at(-1) ?? null;
      const upstreamIds = new Set<string>([node.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const edge of runEdges) {
          if (
            upstreamIds.has(edge.toNodeId) &&
            !upstreamIds.has(edge.fromNodeId)
          ) {
            upstreamIds.add(edge.fromNodeId);
            changed = true;
          }
        }
      }
      const hasUpstreamImageArtifact =
        node.kind === "COMPOSE" &&
        artifacts.some(
          (item) =>
            item.kind === "IMAGE" &&
            item.nodeId !== node.id &&
            upstreamIds.has(item.nodeId),
        );
      return {
        id: node.id,
        type: "chroma",
        position: { x: 0, y: 0 },
        data: {
          node,
          artifact,
          runId,
          runStatus,
          hasUpstreamImageArtifact,
          selected: selectedNodeId === node.id,
          flash: flashSucceeded && node.status === "SUCCEEDED",
        },
      };
    });
  }, [artifacts, flashSucceeded, runEdges, runId, runNodes, runStatus, selectedNodeId]);

  const nextEdges = useMemo<ChromaFlowEdge[]>(() => {
    const statusById = new Map(runNodes.map((node) => [node.id, node.status]));
    return runEdges.map((edge): Edge => {
      const sourceStatus = statusById.get(edge.fromNodeId);
      const targetStatus = statusById.get(edge.toNodeId);
      const style: Edge["style"] = { stroke: "rgba(255,255,255,0.16)", strokeWidth: 1.5 };
      let animated = false;
      if (targetStatus === "SKIPPED") {
        style.strokeDasharray = "5 5";
        style.opacity = 0.3;
      } else if (sourceStatus === "SUCCEEDED") {
        style.stroke = "var(--green)";
        style.opacity = 0.4;
      } else if (sourceStatus === "RUNNING") {
        style.stroke = "var(--amber)";
        animated = true;
      }
      return {
        id: edge.id,
        source: edge.fromNodeId,
        target: edge.toNodeId,
        type: "smoothstep",
        animated,
        style,
      };
    });
  }, [runEdges, runNodes]);

  useEffect(() => {
    const result = layoutGraph(nextNodes, nextEdges, previousPositionsRef.current);
    previousPositionsRef.current = new Map(
      result.nodes.map((node) => [node.id, node.position]),
    );
    document.documentElement.style.setProperty(
      "--layout-duration",
      `${result.duration}ms`,
    );
    setNodes(result.nodes);
    setEdges(nextEdges);
    const nextNodeIds = new Set(result.nodes.map((node) => node.id));
    const addedNode = [...nextNodeIds].some(
      (nodeId) => !previousNodeIdsRef.current.has(nodeId),
    );
    previousNodeIdsRef.current = nextNodeIds;
    if (addedNode) {
      requestAnimationFrame(() => {
        void fitView({ padding: 0.2 });
      });
    }
  }, [fitView, nextEdges, nextNodes, setEdges, setNodes]);

  useEffect(() => {
    previousPositionsRef.current = new Map(
      nodes.map((node) => [node.id, node.position]),
    );
  }, [nodes]);

  const onNodeClick = useCallback<NodeMouseHandler<ChromaFlowNode>>(
    (_event, node) => onNodeSelect(node.id),
    [onNodeSelect],
  );

  return (
    <div className="canvas-shell">
      <div className="canvas-content" data-state={state}>
        {nodes.length === 0 ? (
          <div className="canvas-empty-state">
            <svg className="canvas-empty-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path d="m24 3 19 11v20L24 45 5 34V14L24 3Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="m24 12 11 6v12l-11 6-11-6V18l11-6Z" stroke="currentColor" strokeWidth="1" />
            </svg>
            <p>Type a brief and press Run.</p>
            <span>The graph will appear here as agents fire.</span>
          </div>
        ) : null}
        {/* Keep attribution hidden for the hackathon demo; production should retain it or use a paid license. */}
        <ReactFlow<ChromaFlowNode, ChromaFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodesDraggable={true}
          nodesConnectable={false}
          panOnDrag={[1, 2]}
          selectionOnDrag={false}
          zoomOnDoubleClick={false}
          preventScrolling={true}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          aria-label="Run graph canvas"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="rgba(255,255,255,0.05)"
          />
          <Controls position="bottom-left" />
          <MiniMap
            position="bottom-right"
            className="run-minimap"
            style={{ width: 160, height: 100 }}
            nodeColor={statusColor}
            maskColor="rgba(10,10,10,0.72)"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
      {connection === "reconnecting" ? (
        <div className="canvas-connection-label" aria-live="polite">
          Reconnecting to run…
        </div>
      ) : null}
    </div>
  );
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasFlow {...props} />
    </ReactFlowProvider>
  );
}
