/**
 * Neon cold-start keepalive.
 *
 * Pings the database every 4 minutes with `SELECT 1` so the serverless
 * compute instance stays warm while preparing a demo. Run it in a
 * background terminal during demo prep — it is NOT a production daemon:
 *
 *   pnpm db:keepalive
 *
 * Stop with Ctrl+C; the Prisma client disconnects cleanly.
 */
import { PrismaClient } from "@prisma/client";

const INTERVAL_MS = 4 * 60 * 1000;

const prisma = new PrismaClient();

async function ping() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(
      `[keepalive] ok ${new Date().toISOString()} (${Date.now() - started}ms)`,
    );
  } catch (error) {
    console.error(
      `[keepalive] failed ${new Date().toISOString()}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function shutdown() {
  clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
}

console.log(
  `[keepalive] starting; pinging every ${INTERVAL_MS / 1000}s (Ctrl+C to stop)`,
);
await ping();
const timer = setInterval(ping, INTERVAL_MS);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
