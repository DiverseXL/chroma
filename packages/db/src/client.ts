import { PrismaClient as BasePrismaClient } from "@prisma/client";

type PrismaErrorWithCode = {
  code?: unknown;
};

/**
 * Prisma error codes for transient connection/pool failures:
 * P1001 (cannot reach server), P1002 (DNS failure), P1008 (operation
 * timeout), P1017 (query engine restarted), P2024 (pool timeout).
 * Constraint errors such as P2002 are deliberately excluded.
 */
const RETRYABLE_CONNECTION_CODES = [
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2024",
];

/**
 * Backoff schedule for connection retries: initial call plus three retries
 * at 1s, 3s, and 7s (11s worst case), sized to absorb a cold-started
 * serverless database that needs a few seconds to accept connections.
 */
const RETRY_DELAYS_MS = [1000, 3000, 7000];

function isRetryableConnectionError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    RETRYABLE_CONNECTION_CODES.includes(
      String((error as PrismaErrorWithCode).code),
    )
  );
}

/**
 * Retries a single Prisma operation on transient connection/pool errors.
 *
 * Up to three retries follow the 1s/3s/7s schedule above; non-connection
 * errors (e.g. P2002 unique-constraint violations) are thrown immediately.
 * Each retry logs a single dev-only line so cold-start recoveries are
 * visible in the server console.
 *
 * @param operation Prisma operation to run.
 * @param sleep Injectable sleep used between retries (tests stub this).
 * @throws The last retryable error when every attempt fails, or any
 *   non-retryable error immediately.
 */
export async function withPrismaConnectionRetry<T>(
  operation: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableConnectionError(error)) throw error;
      if (attempt === RETRY_DELAYS_MS.length) break;

      const delayMs = RETRY_DELAYS_MS[attempt];
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[db] connection error ${String((error as PrismaErrorWithCode).code)}; retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delayMs}ms`,
        );
      }
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function createPrismaClient() {
  return new BasePrismaClient().$extends({
    query: {
      $allOperations({ args, query }) {
        return withPrismaConnectionRetry(() => query(args));
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;
export type RetryingPrismaClient = Omit<ExtendedPrismaClient, "$on">;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

/**
 * Singleton Prisma Client instance shared across application modules.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { BasePrismaClient as PrismaClient };
