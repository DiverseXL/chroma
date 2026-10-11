import { EventBus, Scheduler } from "@chroma/core";
import { prisma } from "@chroma/db";
import { buildProviders, type ProviderSet } from "@chroma/providers";

/**
 * Global singleton state container for engine components during local development.
 * Note: This in-memory singleton is dev-only and must be replaced with a durable queue before serverless deploy.
 */
const globalEngine = globalThis as unknown as {
  eventBus?: EventBus;
  scheduler?: Scheduler;
  providers?: ProviderSet;
};

/**
 * Shared singleton EventBus instance.
 */
export const eventBus: EventBus =
  globalEngine.eventBus ?? new EventBus({ db: prisma });

/**
 * Shared singleton provider instances.
 */
export const providers: ProviderSet =
  globalEngine.providers ??
  buildProviders({
    CF_WORKER_URL: process.env.CF_WORKER_URL,
    CF_API_KEY: process.env.CF_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_MODEL_TEXT: process.env.GOOGLE_MODEL_TEXT,
    GOOGLE_MODEL_VISION: process.env.GOOGLE_MODEL_VISION,
    KIE_API_KEY: process.env.KIE_API_KEY,
    KIE_BASE_URL: process.env.KIE_BASE_URL,
    KIE_MODEL: process.env.KIE_MODEL,
  });

/**
 * Shared singleton Scheduler instance.
 */
export const scheduler: Scheduler =
  globalEngine.scheduler ??
  new Scheduler({
    providers,
    eventBus,
    db: prisma,
    concurrency: 4,
  });

if (process.env.NODE_ENV !== "production") {
  globalEngine.eventBus = eventBus;
  globalEngine.providers = providers;
  globalEngine.scheduler = scheduler;
}
