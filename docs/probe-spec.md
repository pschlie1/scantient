# Scantient Tier 2 — Subsystem Health Probe Spec

**Version:** 1.0  
**Status:** Active

---

## Overview

Scantient's Tier 2 probe protocol lets monitored apps surface **operational health** data alongside the standard security scan. Apps that implement the probe endpoint expose structured subsystem status (database, auth, payments, email, queue, cache) that Scantient fetches after each security scan.

The probe uses a **shared secret token** for authentication. This token is configured per app in the Scantient dashboard (`probeToken`) and never leaves the server.

---

## Endpoint

```
GET /api/scantient-probe
```

The endpoint path is `/api/scantient-probe` by convention, but any URL can be configured in the Scantient dashboard as the `probeUrl`.

### Authentication

The probe request includes the shared secret in the header:

```
X-Scan-Token: <shared-secret>
```

The endpoint **must** reject requests with a missing or invalid token with HTTP 401.

---

## Request

```http
GET /api/scantient-probe HTTP/1.1
Host: your-app.com
X-Scan-Token: <shared-secret>
User-Agent: Scantient/1.0 (Health Probe)
Accept: application/json
```

---

## Response

### Status Code

- `200 OK` — probe succeeded (even if some subsystems are degraded — `ok: false` in the body is sufficient)
- `401 Unauthorized` — missing or invalid `X-Scan-Token`
- `503 Service Unavailable` — probe itself is unavailable (treated as a total failure by Scantient)

### Response Body (JSON)

```json
{
  "ok": true,
  "respondedAt": "2026-03-02T21:00:00.000Z",
  "latencyMs": 42,
  "subsystems": {
    "database": {
      "ok": true,
      "latencyMs": 12
    },
    "auth": {
      "ok": true,
      "provider": "clerk"
    },
    "payments": {
      "ok": true,
      "provider": "stripe"
    },
    "email": {
      "ok": false,
      "provider": "resend",
      "error": "API key invalid — 403 Forbidden"
    },
    "queue": {
      "ok": true,
      "depth": 5
    },
    "cache": {
      "ok": true,
      "latencyMs": 2
    }
  },
  "version": "1.2.3",
  "environment": "production"
}
```

### Schema (JSON Schema)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["ok", "respondedAt", "latencyMs", "subsystems"],
  "properties": {
    "ok": {
      "type": "boolean",
      "description": "true if all critical subsystems are healthy"
    },
    "respondedAt": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of when the probe ran"
    },
    "latencyMs": {
      "type": "number",
      "description": "Total probe execution time in milliseconds"
    },
    "subsystems": {
      "type": "object",
      "description": "Health of each subsystem (all fields optional)",
      "properties": {
        "database": { "$ref": "#/$defs/Subsystem" },
        "auth":     { "$ref": "#/$defs/Subsystem" },
        "payments": { "$ref": "#/$defs/Subsystem" },
        "email":    { "$ref": "#/$defs/Subsystem" },
        "queue":    { "$ref": "#/$defs/QueueSubsystem" },
        "cache":    { "$ref": "#/$defs/Subsystem" }
      }
    },
    "version": {
      "type": "string",
      "description": "App version or git SHA (optional)"
    },
    "environment": {
      "type": "string",
      "enum": ["production", "staging", "development"],
      "description": "Deployment environment (optional)"
    }
  },
  "$defs": {
    "Subsystem": {
      "type": "object",
      "required": ["ok"],
      "properties": {
        "ok":        { "type": "boolean" },
        "latencyMs": { "type": "number" },
        "provider":  { "type": "string" },
        "error":     { "type": "string" }
      }
    },
    "QueueSubsystem": {
      "allOf": [
        { "$ref": "#/$defs/Subsystem" },
        { "properties": { "depth": { "type": "number" } } }
      ]
    }
  }
}
```

---

## Required vs Optional Fields

| Field | Required | Notes |
|-------|----------|-------|
| `ok` | ✅ | true = all critical subsystems healthy |
| `respondedAt` | ✅ | ISO 8601, include timezone offset |
| `latencyMs` | ✅ | Self-reported probe duration |
| `subsystems` | ✅ | Object (can be empty `{}`) |
| `subsystems.database` | Optional | Highly recommended |
| `subsystems.auth` | Optional | Include if auth provider is external |
| `subsystems.payments` | Optional | Include if using Stripe / payment provider |
| `subsystems.email` | Optional | Include if using Resend / SendGrid / etc. |
| `subsystems.queue` | Optional | Include if using BullMQ / SQS / etc. |
| `subsystems.cache` | Optional | Include if using Redis / Upstash / etc. |
| `version` | Optional | Git SHA or semver |
| `environment` | Optional | `"production"` \| `"staging"` |

---

## Security Guidelines

1. **Validate the token first** — before doing any work. Return 401 immediately on mismatch.
2. **Use constant-time comparison** for the token to prevent timing attacks.
3. **Never expose internal errors** — return generic messages in `error` fields, not stack traces.
4. **Use `crypto.timingSafeEqual`** (Node.js) or equivalent for token comparison.
5. **Keep the token secret** — treat it like a database password. Rotate it if exposed.

---

## Example: Next.js App Router + Prisma + Stripe + Resend

```typescript
// app/api/scantient-probe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import Stripe from "stripe";
import { Resend } from "resend";

const PROBE_TOKEN = process.env.SCANTIENT_PROBE_TOKEN!;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY!);

function tokenValid(provided: string | null): boolean {
  if (!provided) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(PROBE_TOKEN);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("x-scan-token");
  if (!tokenValid(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const probeStart = Date.now();
  const subsystems: Record<string, { ok: boolean; latencyMs?: number; provider?: string; error?: string }> = {};

  // Database check
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    subsystems.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    subsystems.database = { ok: false, error: "Database unreachable" };
  }

  // Stripe check
  try {
    await stripe.balance.retrieve();
    subsystems.payments = { ok: true, provider: "stripe" };
  } catch (err) {
    subsystems.payments = { ok: false, provider: "stripe", error: "Stripe API unreachable" };
  }

  // Resend check
  try {
    const domains = await resend.domains.list();
    subsystems.email = {
      ok: !domains.error,
      provider: "resend",
      ...(domains.error ? { error: "Resend API error" } : {}),
    };
  } catch {
    subsystems.email = { ok: false, provider: "resend", error: "Resend unreachable" };
  }

  const allOk = Object.values(subsystems).every((s) => s.ok);

  return NextResponse.json({
    ok: allOk,
    respondedAt: new Date().toISOString(),
    latencyMs: Date.now() - probeStart,
    subsystems,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    environment: process.env.NODE_ENV === "production" ? "production" : "staging",
  });
}
```

---

## Example: Express + pg + Stripe

```typescript
// routes/probe.ts
import express from "express";
import { timingSafeEqual } from "crypto";
import { Pool } from "pg";
import Stripe from "stripe";

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const PROBE_TOKEN = process.env.SCANTIENT_PROBE_TOKEN!;

function tokenValid(provided: string | undefined): boolean {
  if (!provided) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(PROBE_TOKEN);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

router.get("/api/scantient-probe", async (req, res) => {
  if (!tokenValid(req.headers["x-scan-token"] as string)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const probeStart = Date.now();
  const subsystems: Record<string, { ok: boolean; latencyMs?: number; provider?: string; error?: string }> = {};

  // Database check
  try {
    const dbStart = Date.now();
    await pool.query("SELECT 1");
    subsystems.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch {
    subsystems.database = { ok: false, error: "Database unreachable" };
  }

  // Stripe check
  try {
    await stripe.balance.retrieve();
    subsystems.payments = { ok: true, provider: "stripe" };
  } catch {
    subsystems.payments = { ok: false, provider: "stripe", error: "Stripe API unreachable" };
  }

  const allOk = Object.values(subsystems).every((s) => s.ok);

  res.json({
    ok: allOk,
    respondedAt: new Date().toISOString(),
    latencyMs: Date.now() - probeStart,
    subsystems,
    version: process.env.npm_package_version ?? "unknown",
    environment: process.env.NODE_ENV ?? "production",
  });
});

export default router;
```

---

## Configuring in Scantient Dashboard

1. Go to **Apps** → select your app → **Edit**
2. Set **Probe URL**: `https://your-app.com/api/scantient-probe`
3. Set **Probe Token**: generate a random 32-byte secret, e.g.:
   ```bash
   openssl rand -hex 32
   ```
4. Add the token to your app's environment variables as `SCANTIENT_PROBE_TOKEN`
5. Save — Scantient will probe your app after each security scan

---

## Scantient Client Behavior

- **Request**: `GET {probeUrl}` with `X-Scan-Token: {token}` header
- **Timeout**: 10 seconds
- **Redirects**: up to 3 hops (SSRF-safe)
- **On success**: stores `ProbeResult` JSON in `MonitorRun.probeResult`
- **On failure**: stores `{ ok: false, error: "..." }` — never blocks the security scan
- **Retry**: not retried within the same scan; the next scheduled scan will try again
