import { EventBus, MockAdapter, Scheduler } from "@chroma/core";
import { prisma } from "@chroma/db";

/**
 * Global singleton state container for engine components during local development.
 * Note: This in-memory singleton is dev-only and must be replaced with a durable queue before serverless deploy.
 */
const globalEngine = globalThis as unknown as {
  eventBus?: EventBus;
  scheduler?: Scheduler;
  adapter?: MockAdapter;
};

/**
 * Shared singleton EventBus instance.
 */
export const eventBus: EventBus =
  globalEngine.eventBus ?? new EventBus({ db: prisma });

/**
 * Shared singleton MockAdapter provider instance.
 */
export const mockAdapter: MockAdapter =
  globalEngine.adapter ?? new MockAdapter();

/**
 * Shared singleton Scheduler instance.
 */
export const scheduler: Scheduler =
  globalEngine.scheduler ??
  new Scheduler({
    adapter: mockAdapter,
    eventBus,
    db: prisma,
    concurrency: 4,
  });

if (process.env.NODE_ENV !== "production") {
  globalEngine.eventBus = eventBus;
  globalEngine.adapter = mockAdapter;
  globalEngine.scheduler = scheduler;
}
