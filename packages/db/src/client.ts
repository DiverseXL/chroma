import { PrismaClient as BasePrismaClient } from "@prisma/client";

type PrismaErrorWithCode = {
  code?: unknown;
};

function isRetryableConnectionError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    ["P1001", "P2024"].includes(
      String((error as PrismaErrorWithCode).code),
    )
  );
}

/**
 * Retries a single Prisma operation once for transient connection/pool errors.
 */
export async function withPrismaConnectionRetry<T>(
  operation: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableConnectionError(error)) throw error;
    await sleep(1000);
    return operation();
  }
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
