import type { ExecutionContext } from "./types.js";

/**
 * Output of image edit execution.
 */
export interface ImageEditOutput {
  artifactId: string;
}

/**
 * Executes image editing.
 * TODO (Step 3): Replace stub with real image edit provider integration.
 *
 * @param _input Upstream source image and editing instructions.
 * @param ctx Node execution context.
 * @returns Resulting edited image artifact ID.
 */
export async function executeImageEdit(
  _input: unknown,
  ctx: ExecutionContext,
): Promise<ImageEditOutput> {
  const result = await ctx.adapter.editImage({
    sourceArtifactId: "stub-source-id",
    instruction: "Stub edit instruction",
  });

  const artifact = await ctx.artifacts.write(
    result.bytes,
    result.mimeType,
    result.width,
    result.height,
    result.metadata,
  );

  return { artifactId: artifact.id };
}
