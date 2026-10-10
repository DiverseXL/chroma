import type { EdgeSpec, GraphSpec, NodeSpec } from "../types/index.js";

/**
 * Compiled representation of an executable workflow graph.
 */
export interface CompiledGraph {
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  order: string[];
  rank: Map<string, number>;
  fanOut: Map<string, string[]>;
  fanIn: Map<string, string[]>;
}

/**
 * Reason codes identifying why a GraphSpec failed validation.
 */
export type GraphValidationReason =
  | "DUPLICATE_NODE_ID"
  | "UNKNOWN_NODE_REFERENCE"
  | "CYCLE_DETECTED"
  | "MISSING_REQUIRED_INPUT"
  | "UNREACHABLE_FROM_PLAN"
  | "NO_TERMINAL_NODE";

/**
 * Error raised when a GraphSpec violates graph structural or semantic constraints.
 */
export class GraphValidationError extends Error {
  /**
   * Initializes a new GraphValidationError.
   * @param reason The specific constraint violation category.
   * @param detail Human-readable explanation and context (e.g. offending node IDs).
   */
  constructor(
    public readonly reason: GraphValidationReason,
    public readonly detail: string,
  ) {
    super(`Graph validation error [${reason}]: ${detail}`);
    this.name = "GraphValidationError";
  }
}

/**
 * Compiles and validates a raw GraphSpec into an indexed CompiledGraph.
 * Enforces uniqueness, edge references, acyclicity, port bindings, reachability from PLAN, and terminal node existence.
 *
 * @param spec The graph specification to compile.
 * @returns Fully compiled and topologically ordered graph.
 * @throws {GraphValidationError} If any structural constraint is violated.
 */
export function compileGraph(spec: GraphSpec): CompiledGraph {
  // 1. Every node ID is unique
  const nodeMap = new Map<string, NodeSpec>();
  for (const node of spec.nodes) {
    if (nodeMap.has(node.id)) {
      throw new GraphValidationError(
        "DUPLICATE_NODE_ID",
        `Duplicate node id detected: "${node.id}"`,
      );
    }
    nodeMap.set(node.id, node);
  }

  // 2. Every edge references existing nodes
  for (const edge of spec.edges) {
    if (!nodeMap.has(edge.from)) {
      throw new GraphValidationError(
        "UNKNOWN_NODE_REFERENCE",
        `Edge references non-existent source node: "${edge.from}"`,
      );
    }
    if (!nodeMap.has(edge.to)) {
      throw new GraphValidationError(
        "UNKNOWN_NODE_REFERENCE",
        `Edge references non-existent target node: "${edge.to}"`,
      );
    }
  }

  // Initialize fanIn and fanOut maps
  const fanOut = new Map<string, string[]>();
  const fanIn = new Map<string, string[]>();
  for (const node of spec.nodes) {
    fanOut.set(node.id, []);
    fanIn.set(node.id, []);
  }

  for (const edge of spec.edges) {
    const targets = fanOut.get(edge.from)!;
    if (!targets.includes(edge.to)) {
      targets.push(edge.to);
    }
    const sources = fanIn.get(edge.to)!;
    if (!sources.includes(edge.from)) {
      sources.push(edge.from);
    }
  }

  // 3. Every required input port declared in NodeSpec.inputs has exactly one inbound edge
  for (const node of spec.nodes) {
    const requiredPorts = Object.keys(node.inputs);
    for (const port of requiredPorts) {
      const matchingEdges = spec.edges.filter(
        (e) => e.to === node.id && e.toPort === port,
      );
      if (matchingEdges.length === 0) {
        throw new GraphValidationError(
          "MISSING_REQUIRED_INPUT",
          `Node "${node.id}" is missing inbound edge for declared input port "${port}"`,
        );
      }
      if (matchingEdges.length > 1) {
        throw new GraphValidationError(
          "MISSING_REQUIRED_INPUT",
          `Node "${node.id}" has multiple inbound edges for declared input port "${port}"`,
        );
      }
    }
  }

  // 4. Every node is reachable from at least one PLAN node
  const planNodes = spec.nodes.filter((n) => n.kind === "PLAN");
  if (planNodes.length === 0) {
    throw new GraphValidationError(
      "UNREACHABLE_FROM_PLAN",
      "Graph contains no PLAN node; all nodes are unreachable from PLAN",
    );
  }

  const reachable = new Set<string>();
  const reachQueue: string[] = planNodes.map((n) => n.id);
  for (const p of reachQueue) {
    reachable.add(p);
  }

  while (reachQueue.length > 0) {
    const current = reachQueue.shift()!;
    for (const downstream of fanOut.get(current) ?? []) {
      if (!reachable.has(downstream)) {
        reachable.add(downstream);
        reachQueue.push(downstream);
      }
    }
  }

  for (const node of spec.nodes) {
    if (!reachable.has(node.id)) {
      throw new GraphValidationError(
        "UNREACHABLE_FROM_PLAN",
        `Orphan node "${node.id}" is not reachable from any PLAN node`,
      );
    }
  }

  // 5. At least one node has out-degree zero (terminal node exists)
  const hasTerminalNode = spec.nodes.some(
    (n) => (fanOut.get(n.id)?.length ?? 0) === 0,
  );
  if (!hasTerminalNode) {
    throw new GraphValidationError(
      "NO_TERMINAL_NODE",
      "Graph contains no terminal node with out-degree zero",
    );
  }

  // 6. No cycles. Use Kahn's algorithm to compute topological order.
  const inDegree = new Map<string, number>();
  for (const node of spec.nodes) {
    inDegree.set(node.id, fanIn.get(node.id)!.length);
  }

  const kahnQueue: string[] = [];
  for (const [nodeId, deg] of inDegree.entries()) {
    if (deg === 0) {
      kahnQueue.push(nodeId);
    }
  }

  const order: string[] = [];
  while (kahnQueue.length > 0) {
    const current = kahnQueue.shift()!;
    order.push(current);

    for (const neighbor of fanOut.get(current)!) {
      const remainingDeg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, remainingDeg);
      if (remainingDeg === 0) {
        kahnQueue.push(neighbor);
      }
    }
  }

  if (order.length !== spec.nodes.length) {
    const offendingNodes = spec.nodes
      .filter((n) => (inDegree.get(n.id) ?? 0) > 0)
      .map((n) => n.id);
    throw new GraphValidationError(
      "CYCLE_DETECTED",
      `Cycle detected involving nodes: [${offendingNodes.join(", ")}]`,
    );
  }

  // 7. Compute rank (longest path from any root)
  const rank = new Map<string, number>();
  for (const nodeId of order) {
    const parents = fanIn.get(nodeId)!;
    if (parents.length === 0) {
      rank.set(nodeId, 0);
    } else {
      let maxParentRank = 0;
      for (const parent of parents) {
        const parentRank = rank.get(parent) ?? 0;
        if (parentRank > maxParentRank) {
          maxParentRank = parentRank;
        }
      }
      rank.set(nodeId, maxParentRank + 1);
    }
  }

  return {
    nodes: spec.nodes,
    edges: spec.edges,
    order,
    rank,
    fanOut,
    fanIn,
  };
}
