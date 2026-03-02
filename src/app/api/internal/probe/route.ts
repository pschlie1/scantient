/**
 * Scantient's own probe endpoint — reference implementation of the probe spec.
 *
 * This is Scantient's own /api/internal/probe endpoint. It demonstrates the
 * probe protocol defined in docs/probe-spec.md and provides a health check
 * for Scantient's own subsystems (database, auth, payments, email).
 *
 * Authentication: X-Scan-Token header must match SCANTIENT_PROBE_TOKEN (or INTERNAL_PROBE_TOKEN)
 * Returns: ProbeResult JSON — see docs/probe-spec.md for full schema
 *
 * Complies with all security guidelines:
 *  - Token verified with constant-time comparison before any work
 *  - All outbound fetches use ssrfSafeFetch
 *  - Generic errors only — no stack traces in responses
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { ssrfSafeFetch } from "@/lib/ssrf-guard";

// ─── Token validation ─────────────────────────────────────────────────────────

function getProbeToken(): string | null {
  return process.env.SCANTIENT_PROBE_TOKEN ?? process.env.INTERNAL_PROBE_TOKEN ?? null;
}

function tokenValid(provided: string | null): boolean {
  const expected = getProbeToken();
  if (!provided || !expected) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── Subsystem check helpers ──────────────────────────────────────────────────

type SubsystemResult = {
  ok: boolean;
  latencyMs?: number;
  provider?: string;
  error?: string;
};

async function checkDatabase(): Promise<SubsystemResult> {
  const t = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - t };
  } catch {
    return { ok: false, latencyMs: Date.now() - t, error: "Database unreachable" };
  }
}

function checkAuth(): SubsystemResult {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return { ok: false, error: "Auth secret not configured" };
  }
  return { ok: true };
}

async function checkPayments(): Promise<SubsystemResult | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null; // Not configured — skip

  try {
    const res = await ssrfSafeFetch(
      "https://api.stripe.com/v1/balance",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "User-Agent": "Scantient/1.0 (Probe)",
        },
        signal: AbortSignal.timeout(8_000),
      },
      1,
    );

    if (res.ok) {
      return { ok: true, provider: "stripe" };
    } else if (res.status === 401 || res.status === 403) {
      return { ok: false, provider: "stripe", error: "Stripe API key invalid or revoked" };
    } else {
      return { ok: false, provider: "stripe", error: `Stripe API error: HTTP ${res.status}` };
    }
  } catch (err) {
    return {
      ok: false,
      provider: "stripe",
      error: err instanceof Error && err.message.includes("Timeout")
        ? "Stripe API timed out"
        : "Stripe API unreachable",
    };
  }
}

async function checkEmail(): Promise<SubsystemResult | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null; // Not configured — skip

  try {
    const res = await ssrfSafeFetch(
      "https://api.resend.com/emails",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "User-Agent": "Scantient/1.0 (Probe)",
        },
        signal: AbortSignal.timeout(8_000),
      },
      1,
    );

    if (res.ok) {
      return { ok: true, provider: "resend" };
    } else if (res.status === 401 || res.status === 403) {
      return { ok: false, provider: "resend", error: "Resend API key invalid or revoked" };
    } else {
      return { ok: false, provider: "resend", error: `Resend API error: HTTP ${res.status}` };
    }
  } catch (err) {
    return {
      ok: false,
      provider: "resend",
      error: err instanceof Error && err.message.includes("Timeout")
        ? "Resend API timed out"
        : "Resend API unreachable",
    };
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const token = request.headers.get("x-scan-token");

  if (!tokenValid(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const probeStart = Date.now();

  // Run subsystem checks — all in parallel for speed
  const [dbResult, paymentsResult, emailResult] = await Promise.all([
    checkDatabase(),
    checkPayments(),
    checkEmail(),
  ]);

  const authResult = checkAuth();

  // Compose subsystems object (only include configured subsystems)
  const subsystems: Record<string, SubsystemResult> = {
    database: dbResult,
    auth: authResult,
  };

  if (paymentsResult !== null) {
    subsystems.payments = paymentsResult;
  }
  if (emailResult !== null) {
    subsystems.email = emailResult;
  }

  const allOk = Object.values(subsystems).every((s) => s.ok);

  const body = {
    ok: allOk,
    respondedAt: new Date().toISOString(),
    latencyMs: Date.now() - probeStart,
    subsystems,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    environment:
      process.env.NODE_ENV === "production"
        ? "production"
        : process.env.NODE_ENV === "test"
          ? "development"
          : "staging",
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      // Probe responses must not be cached — they represent live health state
      "Cache-Control": "no-store",
    },
  });
}
