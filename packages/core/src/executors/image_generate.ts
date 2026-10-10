import type { ExecutionContext } from "./types.js";

/**
 * Output of image generation execution.
 */
export interface ImageGenerateOutput {
  artifactId: string;
  prompt: string;
}

/**
 * Executes image generation by dispatching to the configured provider adapter and persisting the resulting artifact.
 *
 * @param input Upstream prompt or parameters.
 * @param ctx Node execution context.
 * @returns Resulting artifact ID and executed prompt.
 */
export async function executeImageGenerate(
  input: unknown,
  ctx: ExecutionContext,
): Promise<ImageGenerateOutput> {
  let prompt = "A cinematic frame under dusk lighting";
  if (typeof input === "string") {
    prompt = input;
  } else if (
    typeof input === "object" &&
    input !== null &&
    "prompt" in input
  ) {
    prompt = String((input as { prompt: unknown }).prompt);
  }

  const result = await ctx.adapter.generateImage({
    prompt,
    width: 512,
    height: 512,
  });

  const artifact = await ctx.artifacts.write(
    result.bytes,
    result.mimeType,
    result.width,
    result.height,
    result.metadata,
  );

  return {
    artifactId: artifact.id,
    prompt,
  };
}
