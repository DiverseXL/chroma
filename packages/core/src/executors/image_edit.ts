import { ProviderError } from "../provider/adapter.js";
import type { ExecutionContext } from "./types.js";

/**
 * Output of image edit execution.
 */
export interface ImageEditOutput {
  artifactId: string;
}

/**
 * Executes an in-place image edit.
 *
 * The Cloudflare Workers AI model bound to the image worker does not expose an
 * edit endpoint as of the verified provider facts (cloudflare.ts TODO comment).
 * This executor therefore throws ProviderError "image_edit_not_supported".
 *
 * The Scheduler must handle IMAGE_EDIT node failures gracefully: on failure,
 * the node is marked SKIPPED and the run continues rather than failing entirely.
 *
 * TODO: When Cloudflare exposes an edit-capable model, implement this by:
 *   1. Reading the source artifact bytes via readArtifact.
 *   2. Calling ctx.providers.image.editImage with the bytes and instruction.
 *   3. Writing the result via ctx.artifacts.write.
 *
 * @param _input Upstream source image and editing instructions.
 * @param _ctx Node execution context.
 * @throws {ProviderError} Always, with code "image_edit_not_supported".
 */
export async function executeImageEdit(
  _input: unknown,
  _ctx: ExecutionContext,
): Promise<ImageEditOutput> {
  throw new ProviderError(
    "Image editing is not supported: the deployed Cloudflare worker does not expose an edit model.",
    { code: "image_edit_not_supported" },
  );
}
