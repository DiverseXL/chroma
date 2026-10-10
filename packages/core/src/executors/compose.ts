import type { ExecutionContext } from "./types.js";

/**
 * Output of compose execution.
 */
export interface ComposeOutput {
  artifactId: string;
  imageIds: string[];
}

/**
 * Aggregates all produced storyboard image artifacts in creation order and writes a composition JSON artifact.
 *
 * @param _input Upstream panel artifact outputs.
 * @param ctx Node execution context.
 * @returns Saved composition artifact ID and list of contained image IDs.
 */
export async function executeCompose(
  _input: unknown,
  ctx: ExecutionContext,
): Promise<ComposeOutput> {
  const artifacts = await ctx.db.artifact.findMany({
    where: {
      node: { runId: ctx.runId },
      kind: "IMAGE",
    },
    orderBy: { createdAt: "asc" },
  });

  const imageIds = artifacts.map((a) => a.id);
  const jsonContent = JSON.stringify({ imageIds, count: imageIds.length }, null, 2);
  const bytes = new TextEncoder().encode(jsonContent);

  const savedArtifact = await ctx.artifacts.write(
    bytes,
    "application/json",
    undefined,
    undefined,
    { imageIds, count: imageIds.length },
  );

  return {
    artifactId: savedArtifact.id,
    imageIds,
  };
}
