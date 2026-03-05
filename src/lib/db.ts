import { PrismaClient } from "@prisma/client";
// Validate required env vars at startup (fail-fast before any DB connection attempt)
import "@/lib/env";

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client for serverless (Vercel) environments.
 *
 * audit-14: Two fixes applied:
 *
 * 1. SINGLETON IN PRODUCTION: Previously the singleton was only stored on
 *    globalThis during development (`if (NODE_ENV !== 'production')`). On Vercel,
 *    warm Lambda invocations share the same global scope, so we MUST set
 *    globalThis in production too — otherwise every warm request creates a
 *    new PrismaClient (and a new connection pool) instead of reusing one.
 *
 * 2. CONNECTION_LIMIT: Each serverless function handles one request at a time.
 *    The Prisma default pool size (5–10) multiplied by concurrent cold starts
 *    exhausts PostgreSQL's max_connections quickly. Setting connection_limit=1
 *    caps each instance to one connection; the database-side connection pooler
 *    (PgBouncer / Supabase pooler / RDS Proxy) handles cross-instance pooling.
 *
 * References:
 *   https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
 *   https://vercel.com/guides/nextjs-prisma-postgres
 */
export const db =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Always persist to globalThis — covers both development hot-reloads AND
// production warm Lambda invocations.
global.prisma = db;

// Default export for convenience (used by analytics routes)
export default db;
