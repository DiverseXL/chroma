import type { ExecutionContext } from "./types.js";

/**
 * Result payload produced by style analysis.
 */
export interface StyleDescriptor {
  palette: string;
  lighting: string;
  mood: string;
  medium: string;
  era: string;
  camera: string;
}

/**
 * Alias retained for backward compatibility.
 */
export type StyleAnalysisOutput = StyleDescriptor;

const STYLE_SYSTEM_PROMPT =
  "You are the Style Analyst in Chroma, a multi-agent image generation system. " +
  "Given a creative brief, extract the visual style attributes as a JSON object with exactly these fields: " +
  "palette (dominant colour palette as a descriptive phrase), " +
  "lighting (lighting conditions and quality), " +
  "mood (emotional tone and atmosphere), " +
  "medium (artistic medium or rendering style), " +
  "era (historical or cultural period), " +
  "camera (camera angle, focal length, and depth-of-field). " +
  "Return only the JSON object, no other text.";

/**
 * Extracts visual style attributes from the creative brief using Gemini text.
 *
 * @param input Brief text or upstream planning output.
 * @param ctx Node execution context.
 * @returns StyleDescriptor with palette, lighting, mood, medium, era, and camera.
 */
export async function executeStyleAnalysis(
  input: unknown,
  ctx: ExecutionContext,
): Promise<StyleDescriptor> {
  const brief =
    typeof input === "string"
      ? input
      : typeof input === "object" && input !== null && "brief" in input
        ? String((input as { brief?: unknown }).brief ?? "")
        : JSON.stringify(input ?? "");

  const result = await ctx.providers.text.completeText({
    system: STYLE_SYSTEM_PROMPT,
    prompt: `Creative brief: ${brief}`,
    json: true,
    temperature: 0.4,
  });

  const parsed = result.parsed as Record<string, unknown>;

  return {
    palette: typeof parsed.palette === "string" ? parsed.palette : "neutral",
    lighting:
      typeof parsed.lighting === "string" ? parsed.lighting : "natural",
    mood: typeof parsed.mood === "string" ? parsed.mood : "cinematic",
    medium: typeof parsed.medium === "string" ? parsed.medium : "digital art",
    era: typeof parsed.era === "string" ? parsed.era : "contemporary",
    camera:
      typeof parsed.camera === "string"
        ? parsed.camera
        : "wide angle, shallow depth of field",
  };
}
