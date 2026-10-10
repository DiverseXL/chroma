/**
 * Domain types for Chroma.
 *
 * These are application-level contracts. Provider-specific request fields,
 * model IDs and response shapes are deliberately NOT modelled here - they are
 * recorded (with source URLs) in docs/provider-facts.md and only added once
 * confirmed against live documentation or a real probe response.
 */

/** Lifecycle of a single node inside a run. */
export type NodeStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed";

/** A piece of generated output, such as an image or a text response. */
export interface Artifact {
  /** Stable identifier. */
  id: string;
  /** Node that produced this artifact. */
  nodeId: string;
  /** Where the bytes live: a local path or a remote URL. */
  uri: string;
  /** MIME type of the artifact, e.g. "image/png". */
  mimeType: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** A single step in a run, bound to one provider model. */
export interface Node {
  /** Stable identifier. */
  id: string;
  /** Run this node belongs to. */
  runId: string;
  status: NodeStatus;
  /** Adapter id that executes this node, e.g. "google" or "pollinations". */
  providerId: string;
  /** Provider model identifier. Must come from docs/provider-facts.md. */
  model: string;
  /** Prompt handed to the provider. */
  prompt: string;
  /** Artifacts produced by this node. */
  artifactIds: string[];
  /** Present when status is "failed". */
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** A top-level generation job composed of nodes. */
export interface Run {
  /** Stable identifier. */
  id: string;
  status: NodeStatus;
  /** The user's original prompt. */
  prompt: string;
  /** Nodes belonging to this run, in creation order. */
  nodeIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Input to {@link ProviderAdapter.generateImage}. */
export interface GenerateImageRequest {
  prompt: string;
}

/** Output of {@link ProviderAdapter.generateImage}. */
export interface GenerateImageResult {
  artifact: Artifact;
}

/** Input to {@link ProviderAdapter.scoreImage}. */
export interface ScoreImageRequest {
  /** Artifact to score, identified by its uri. */
  uri: string;
  /** Plain-text rubric describing how to score the image. */
  rubric: string;
}

/** Output of {@link ProviderAdapter.scoreImage}. */
export interface ScoreImageResult {
  /** Raw provider response, verbatim. */
  raw: unknown;
}

/**
 * Contract every provider must satisfy.
 *
 * Interface only - no implementations ship in this package yet. Adding an
 * implementation requires first confirming the endpoint, model IDs, request
 * fields and response shapes against live documentation or a real probe.
 */
export interface ProviderAdapter {
  /** Stable adapter id used by {@link Node.providerId}. */
  readonly id: string;
  /** Generate an image from a prompt. */
  generateImage(
    request: GenerateImageRequest,
  ): Promise<GenerateImageResult>;
  /** Score an existing image against a rubric. */
  scoreImage(request: ScoreImageRequest): Promise<ScoreImageResult>;
}
