import { describe, expect, it } from "vitest";
import type { GraphSpec } from "../types/index.js";
import { compileGraph, GraphValidationError } from "./compiler.js";

describe("GraphCompiler", () => {
  it("compiles a valid linear graph", () => {
    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-1",
          kind: "PLAN",
          label: "Create Plan",
          inputs: {},
          outputs: ["planOutput"],
        },
        {
          id: "prompt-1",
          kind: "PROMPT_COMPILE",
          label: "Compile Prompt",
          inputs: { planInput: "plan-1.planOutput" },
          outputs: ["promptOutput"],
        },
        {
          id: "img-1",
          kind: "IMAGE_GENERATE",
          label: "Generate Image",
          inputs: { promptInput: "prompt-1.promptOutput" },
          outputs: ["imageOutput"],
        },
      ],
      edges: [
        {
          from: "plan-1",
          to: "prompt-1",
          fromPort: "planOutput",
          toPort: "planInput",
        },
        {
          from: "prompt-1",
          to: "img-1",
          fromPort: "promptOutput",
          toPort: "promptInput",
        },
      ],
    };

    const compiled = compileGraph(spec);
    expect(compiled.order).toEqual(["plan-1", "prompt-1", "img-1"]);
    expect(compiled.rank.get("plan-1")).toBe(0);
    expect(compiled.rank.get("prompt-1")).toBe(1);
    expect(compiled.rank.get("img-1")).toBe(2);
    expect(compiled.fanOut.get("img-1")).toEqual([]);
  });

  it("compiles a valid fan-out graph (one root, three parallel children, one join)", () => {
    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-root",
          kind: "PLAN",
          label: "Plan",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "child-a",
          kind: "IMAGE_GENERATE",
          label: "Branch A",
          inputs: { in: "plan-root.out" },
          outputs: ["outA"],
        },
        {
          id: "child-b",
          kind: "IMAGE_GENERATE",
          label: "Branch B",
          inputs: { in: "plan-root.out" },
          outputs: ["outB"],
        },
        {
          id: "child-c",
          kind: "IMAGE_GENERATE",
          label: "Branch C",
          inputs: { in: "plan-root.out" },
          outputs: ["outC"],
        },
        {
          id: "join-node",
          kind: "COMPOSE",
          label: "Join",
          inputs: {
            inA: "child-a.outA",
            inB: "child-b.outB",
            inC: "child-c.outC",
          },
          outputs: ["final"],
        },
      ],
      edges: [
        { from: "plan-root", to: "child-a", fromPort: "out", toPort: "in" },
        { from: "plan-root", to: "child-b", fromPort: "out", toPort: "in" },
        { from: "plan-root", to: "child-c", fromPort: "out", toPort: "in" },
        { from: "child-a", to: "join-node", fromPort: "outA", toPort: "inA" },
        { from: "child-b", to: "join-node", fromPort: "outB", toPort: "inB" },
        { from: "child-c", to: "join-node", fromPort: "outC", toPort: "inC" },
      ],
    };

    const compiled = compileGraph(spec);
    expect(compiled.order[0]).toBe("plan-root");
    expect(compiled.order[compiled.order.length - 1]).toBe("join-node");
    expect(compiled.rank.get("plan-root")).toBe(0);
    expect(compiled.rank.get("child-a")).toBe(1);
    expect(compiled.rank.get("child-b")).toBe(1);
    expect(compiled.rank.get("child-c")).toBe(1);
    expect(compiled.rank.get("join-node")).toBe(2);
  });

  it("rejects cycles with the correct reason code and offending node ids", () => {
    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-1",
          kind: "PLAN",
          label: "Plan",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "node-a",
          kind: "IMAGE_GENERATE",
          label: "Node A",
          inputs: { fromB: "node-b.out" },
          outputs: ["out"],
        },
        {
          id: "node-b",
          kind: "IMAGE_GENERATE",
          label: "Node B",
          inputs: { fromA: "node-a.out" },
          outputs: ["out"],
        },
        {
          id: "terminal",
          kind: "COMPOSE",
          label: "Terminal",
          inputs: { fromA: "node-a.out" },
          outputs: [],
        },
      ],
      edges: [
        { from: "plan-1", to: "node-a", fromPort: "out", toPort: "fromPlan" },
        { from: "node-a", to: "node-b", fromPort: "out", toPort: "fromA" },
        { from: "node-b", to: "node-a", fromPort: "out", toPort: "fromB" },
        { from: "node-a", to: "terminal", fromPort: "out", toPort: "fromA" },
      ],
    };

    expect(() => compileGraph(spec)).toThrowError(GraphValidationError);
    try {
      compileGraph(spec);
    } catch (err) {
      const gve = err as GraphValidationError;
      expect(gve.reason).toBe("CYCLE_DETECTED");
      expect(gve.detail).toContain("node-a");
      expect(gve.detail).toContain("node-b");
    }
  });

  it("rejects missing required input with correct reason code", () => {
    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-1",
          kind: "PLAN",
          label: "Plan",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "node-a",
          kind: "IMAGE_GENERATE",
          label: "Node A",
          inputs: { requiredInput: "type" },
          outputs: [],
        },
      ],
      edges: [],
    };

    expect(() => compileGraph(spec)).toThrowError(GraphValidationError);
    try {
      compileGraph(spec);
    } catch (err) {
      const gve = err as GraphValidationError;
      expect(gve.reason).toBe("MISSING_REQUIRED_INPUT");
      expect(gve.detail).toContain("requiredInput");
    }
  });

  it("rejects malformed input references", () => {
    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-1",
          kind: "PLAN",
          label: "Plan",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "node-a",
          kind: "COMPOSE",
          label: "Compose",
          inputs: { image: "plan image" },
          outputs: [],
        },
      ],
      edges: [
        { from: "plan-1", to: "node-a", fromPort: "out", toPort: "image" },
      ],
    };

    expect(() => compileGraph(spec)).toThrowError(GraphValidationError);
    try {
      compileGraph(spec);
    } catch (err) {
      const gve = err as GraphValidationError;
      expect(gve.reason).toBe("INVALID_INPUT_REFERENCE");
      expect(gve.detail).toContain('nodeId.outputPort');
    }
  });

  it("rejects orphan node unreachable from PLAN", () => {
    const spec: GraphSpec = {
      nodes: [
        {
          id: "plan-1",
          kind: "PLAN",
          label: "Plan",
          inputs: {},
          outputs: ["out"],
        },
        {
          id: "connected-terminal",
          kind: "COMPOSE",
          label: "Connected",
          inputs: { in: "plan-1.out" },
          outputs: [],
        },
        {
          id: "orphan-node",
          kind: "IMAGE_GENERATE",
          label: "Orphan",
          inputs: {},
          outputs: [],
        },
      ],
      edges: [
        {
          from: "plan-1",
          to: "connected-terminal",
          fromPort: "out",
          toPort: "in",
        },
      ],
    };

    expect(() => compileGraph(spec)).toThrowError(GraphValidationError);
    try {
      compileGraph(spec);
    } catch (err) {
      const gve = err as GraphValidationError;
      expect(gve.reason).toBe("UNREACHABLE_FROM_PLAN");
      expect(gve.detail).toContain("orphan-node");
    }
  });

  it("rejects duplicate node id", () => {
    const spec: GraphSpec = {
      nodes: [
        {
          id: "duplicate-id",
          kind: "PLAN",
          label: "Plan 1",
          inputs: {},
          outputs: [],
        },
        {
          id: "duplicate-id",
          kind: "PLAN",
          label: "Plan 2",
          inputs: {},
          outputs: [],
        },
      ],
      edges: [],
    };

    expect(() => compileGraph(spec)).toThrowError(GraphValidationError);
    try {
      compileGraph(spec);
    } catch (err) {
      const gve = err as GraphValidationError;
      expect(gve.reason).toBe("DUPLICATE_NODE_ID");
      expect(gve.detail).toContain("duplicate-id");
    }
  });
});
