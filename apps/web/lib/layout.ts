import dagre from "dagre";
import type { ChromaFlowEdge, ChromaFlowNode } from "./runTypes";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 96;
const IMAGE_NODE_HEIGHT = 172;
const COMPOSE_WIDTH = 340;
const COMPOSE_HEIGHT = 276;

function dimensions(node: ChromaFlowNode) {
  if (node.data.node.kind === "COMPOSE" && node.data.artifact?.kind === "IMAGE") {
    return { width: COMPOSE_WIDTH, height: COMPOSE_HEIGHT };
  }
  if (node.data.artifact?.kind === "IMAGE") {
    return { width: NODE_WIDTH, height: IMAGE_NODE_HEIGHT };
  }
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}

export interface GraphLayout {
  nodes: ChromaFlowNode[];
  duration: number;
}

export function layoutGraph(
  nodes: ChromaFlowNode[],
  edges: ChromaFlowEdge[],
  previousPositions: ReadonlyMap<string, { x: number; y: number }>,
): GraphLayout {
  if (nodes.length === 0) {
    return { nodes, duration: 200 };
  }

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 80 });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    graph.setNode(node.id, dimensions(node));
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  let maxDelta = 0;
  const positionedNodes = nodes.map((node) => {
    const size = dimensions(node);
    const center = graph.node(node.id) as { x: number; y: number };
    const position = {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
    };
    const previous = previousPositions.get(node.id);
    if (previous) {
      maxDelta = Math.max(
        maxDelta,
        Math.hypot(position.x - previous.x, position.y - previous.y),
      );
    }
    return { ...node, position };
  });

  return {
    nodes: positionedNodes,
    duration: Math.min(600, 200 + maxDelta * 0.6),
  };
}
