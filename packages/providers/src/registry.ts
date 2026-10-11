/**
 * Provider registry.
 *
 * Constructs the three capability-specific ProviderAdapter instances that the
 * Scheduler and executors depend on. Keeping capability assignment here (rather
 * than inside each executor) makes it straightforward to swap providers per
 * capability without touching engine logic.
 */

import type { ProviderAdapter } from "@chroma/core";
import { ProviderError } from "@chroma/core";
import { CloudflareWorkersAIAdapter } from "./cloudflare.js";
import { CompositeImageAdapter } from "./composite.js";
import { GoogleGeminiAdapter } from "./google.js";
import { KIEAdapter } from "./kie.js";

/**
 * Minimal subset of environment variables required by buildProviders.
 */
export interface ProviderEnv {
  CF_WORKER_URL?: string;
  CF_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_MODEL_TEXT?: string;
  GOOGLE_MODEL_VISION?: string;
  KIE_API_KEY?: string;
  KIE_BASE_URL?: string;
  KIE_MODEL?: string;
}

/**
 * The three capability adapters exposed to the Scheduler and executors.
 */
export interface ProviderSet {
  /** Handles all image generation (Cloudflare Workers AI primary, KIE AI fallback). */
  image: ProviderAdapter;
  /** Handles image scoring / critique (Google Gemini vision). */
  vision: ProviderAdapter;
  /** Handles text completion (Google Gemini text). */
  text: ProviderAdapter;
}

/**
 * Constructs and returns the three provider adapters from environment variables.
 *
 * Fails fast with a ProviderError when a required environment variable is
 * missing so the application surfaces configuration problems at start-up
 * rather than at runtime.
 *
 * @param env Environment variable map (use process.env in production).
 * @returns A ProviderSet with image, vision, and text adapters.
 * @throws {ProviderError} When any required variable is absent.
 */
export function buildProviders(env: ProviderEnv): ProviderSet {
  const missing: string[] = [];

  if (!env.CF_WORKER_URL?.trim()) missing.push("CF_WORKER_URL");
  if (!env.CF_API_KEY?.trim()) missing.push("CF_API_KEY");
  if (!env.GEMINI_API_KEY?.trim()) missing.push("GEMINI_API_KEY");
  if (!env.GOOGLE_MODEL_TEXT?.trim()) missing.push("GOOGLE_MODEL_TEXT");
  if (!env.GOOGLE_MODEL_VISION?.trim()) missing.push("GOOGLE_MODEL_VISION");
  if (!env.KIE_API_KEY?.trim()) missing.push("KIE_API_KEY");

  if (missing.length > 0) {
    throw new ProviderError(
      `buildProviders: missing required environment variables: ${missing.join(", ")}`,
      { code: "misconfigured" },
    );
  }

  const cloudflare = new CloudflareWorkersAIAdapter();
  const kie = new KIEAdapter();

  return {
    // Cloudflare stays the primary image provider; the composite wrapper only
    // reaches KIE when the primary throws a ProviderError (network, rate
    // limit, outage, misconfiguration), keeping KIE spend on real fallbacks.
    image: new CompositeImageAdapter(cloudflare, kie),
    vision: new GoogleGeminiAdapter(),
    text: new GoogleGeminiAdapter(),
  };
}
