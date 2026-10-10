import { ProviderContentFilterError } from "../provider/adapter.js";
import type { ExecutionContext } from "./types.js";

/**
 * Output of image generation execution.
 */
export interface ImageGenerateOutput {
  artifactId: string;
  prompt: string;
  width: number;
  height: number;
}

/** Prefix and suffix appended to a prompt on a content-filter retry. */
const SAFE_PROMPT_PREFIX = "A detailed, cinematic scene: ";
const SAFE_PROMPT_SUFFIX =
  " Photorealistic, high quality, safe for work.";

/**
 * Executes image generation by dispatching to ctx.providers.image and
 * persisting the resulting artifact.
 *
 * On ProviderContentFilterError the prompt is wrapped with an explicit safe
 * framing and retried once. If the retry also fails, the error is re-thrown.
 *
 * @param input Upstream prompt or parameters.
 * @param ctx Node execution context.
 * @returns Resulting artifact ID, prompt, and dimensions.
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

  const width = 512;
  const height = 512;

  /**
   * Attempts a single generateImage call and writes the resulting artifact.
   */
  async function attemptGenerate(
    attemptPrompt: string,
  ): Promise<ImageGenerateOutput> {
    const result = await ctx.providers.image.generateImage({
      prompt: attemptPrompt,
      width,
      height,
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
      prompt: attemptPrompt,
      width: result.width,
      height: result.height,
    };
  }

  try {
    return await attemptGenerate(prompt);
  } catch (err) {
    if (err instanceof ProviderContentFilterError) {
      // Retry once with a safe framing prepended and appended.
      const safePrompt = `${SAFE_PROMPT_PREFIX}${prompt}${SAFE_PROMPT_SUFFIX}`;
      return await attemptGenerate(safePrompt);
    }
    throw err;
  }
}
