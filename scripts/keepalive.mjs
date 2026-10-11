/**
 * Neon cold-start keepalive.
 *
 * Pings the database with `SELECT 1` to keep the serverless compute warm.
 * Run it in a background terminal during demo prep:
 *
 *   pnpm db:keepalive
 *
 * Use --once for a single ping (used by the scheduled GitHub Actions job).
 */
import { PrismaClient } from "@prisma/client";

const INTERVAL_MS = 4 * 60 * 1000;
const once = process.argv.includes("--once");

const prisma = new PrismaClient();

async function ping() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(
      `[keepalive] ok ${new Date().toISOString()} (${Date.now() - started}ms)`,
    );
    return true;
  } catch (error) {
    console.error(
      `[keepalive] failed ${new Date().toISOString()}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

async function shutdown() {
  clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
}

if (once) {
  try {
    if (!(await ping())) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
} else {
  console.log(
    `[keepalive] starting; pinging every ${INTERVAL_MS / 1000}s (Ctrl+C to stop)`,
  );
  await ping();
  const timer = setInterval(ping, INTERVAL_MS);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
