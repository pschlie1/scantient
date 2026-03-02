/**
 * Startup environment variable validation.
 *
 * Validates required env vars at import time using Zod.
 * If required vars are missing the process emits a clear error immediately
 * (fail-fast) rather than producing cryptic runtime failures deep inside a
 * request handler.
 *
 * Import this module from src/lib/db.ts so every route automatically gets
 * the check on cold-start without needing to touch each route.
 *
 * Optional vars are validated only when present (format / type check).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // ─── Required ──────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),

  // ─── Optional — validated when present ────────────────────────────────────
  // Non-critical env vars are intentionally lenient here to avoid taking down
  // the entire API surface due to optional integration misconfiguration.
  // Each integration validates its own config at use-time.
  RESEND_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Validation (runs once at module load — i.e., at server startup)
// ---------------------------------------------------------------------------

function validateEnv() {
  // Skip during Next.js build phase — env vars are only available at runtime
  // on the deployed server, not during `next build` static analysis.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return process.env as NodeJS.ProcessEnv;
  }

  // In test environments, skip strict validation so unit tests can run
  // without a real DATABASE_URL (tests mock the DB layer entirely).
  if (process.env.NODE_ENV === "test") {
    return process.env as NodeJS.ProcessEnv;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");

    console.error(
      `\n❌ Invalid environment configuration — server cannot start safely.\n\nMissing or invalid variables:\n${issues}\n\nSet these in your .env file or deployment environment and restart.\n`,
    );

    // Throw so the process exits immediately in a Node.js server context.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

export const env = validateEnv();
