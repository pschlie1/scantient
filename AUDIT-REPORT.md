# Scantient Security & Performance Audit Report

**Date:** 2026-02-28  
**Auditor:** Automated Deep Audit (OpenClaw)  
**Scope:** Full codebase at `/home/clawuser/.openclaw/workspace/scantient`  
**Live Site:** https://scantient.com  

**Commit:** `8de2ab2` (main branch, clean working tree)

---

## Executive Summary

| Category | Count |
|---|---|
| 🔴 Critical | 3 |
| 🟠 High | 5 |
| 🟡 Medium | 7 |
| 🔵 Low / Info | 5 |
| **Total** | **20** |

**Overall Security Grade: D**  
**Performance Score: 82/100**

---

## 🔴 CRITICAL — Fix Immediately

---

### C-1: Real Production Credentials Committed to Repository

**File:** `.env`  
**Risk:** Full database compromise, unauthorized data access, data destruction

The `.env` file is tracked in git and contains **live production credentials**:

```
DATABASE_URL="postgresql://neondb_owner:npg_FkXQ3IaBweC0@ep-silent-shadow-ai6w5p60-pooler.c-4.us-east-1.aws.neon.tech/neondb..."
DIRECT_URL="postgresql://neondb_owner:npg_FkXQ3IaBweC0@..."
JWT_SECRET="scantient-dev-secret-change-in-production"

CRON_SECRET="dev-secret-replace-in-production"
```

Anyone with access to the repository (including GitHub, Vercel, or any CI/CD logs) has full read/write access to the production Neon PostgreSQL database. The JWT_SECRET and CRON_SECRET are also weak/guessable strings.

**Recommended Fix:**
1. **Immediately rotate the Neon DB password** in the Neon console.
2. Remove `.env` from git history using `git filter-repo` or BFG Repo Cleaner.
3. Add `.env` to `.gitignore` if not already (it appears to not be ignored).
4. Store secrets only in Vercel Environment Variables (never in committed files).
5. Generate strong secrets: `openssl rand -hex 64` for JWT_SECRET and CRON_SECRET.

---

### C-2: Hardcoded JWT Fallback Secret in SSO Routes

**Files:** `src/app/api/auth/sso/init/route.ts:7`, `src/app/api/auth/sso/callback/route.ts:8`  
**Risk:** SSO authentication bypass — attacker can forge state cookies and hijack SSO sessions

Both SSO routes use:
```typescript
const JWT_SECRET = process.env.JWT_SECRET ?? "fallback-secret";
```

If `JWT_SECRET` is unset (or in any environment where it defaults), an attacker who knows the fallback value `"fallback-secret"` can:
1. Craft a forged `vs_sso_state` cookie containing any `orgId` and `codeVerifier`.
2. Skip the SSO provider entirely by replaying the callback URL with a forged state.
3. Impersonate any user in any organization that has SSO enabled.

Note: `src/lib/auth.ts` correctly throws if `JWT_SECRET` is missing — but these SSO routes silently fall back to a known string, creating an inconsistency.

**Recommended Fix:**
```typescript
// Replace in both SSO route files:
const JWT_SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is required");
  return s;
})();
```

---

### C-3: SSRF (Server-Side Request Forgery) in URL Scanner

**Files:** `src/lib/scanner-http.ts:91`, `src/app/api/apps/route.ts`, `src/app/api/apps/bulk/route.ts`, `src/app/api/public/score/route.ts`  
**Risk:** Internal network access, cloud metadata exfiltration, lateral movement

The scanner fetches user-provided URLs without checking for private/internal IP ranges:

```typescript
// scanner-http.ts:91 — no SSRF protection
const response = await fetch(app.url, {
  method: "GET",
  ...
});
```

An authenticated user can register a URL like:
- `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (AWS metadata)
- `http://10.0.0.1/admin` (internal network services)
- `http://localhost:5432` (local database port)

The public `/api/public/score` endpoint similarly fetches arbitrary user-supplied URLs (rate-limited but unauthenticated — an attacker just needs 10 IPs).

**Recommended Fix:**
```typescript
import dns from "node:dns/promises";
import net from "node:net";

async function isPrivateUrl(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  // Block IP-based URLs directly
  if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
    return isPrivateIP(hostname);
  }
  // DNS resolve and check
  try {
    const { address } = await dns.lookup(hostname);
    return isPrivateIP(address);
  } catch { return true; } // fail closed
}

function isPrivateIP(ip: string): boolean {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|::1|fc|fd)/i.test(ip);
}
```

Add this check before any `fetch(userProvidedUrl, ...)` call.

---

## 🟠 HIGH — Fix This Week

---

### H-1: Middleware Does Not Validate JWT Signature

**File:** `src/middleware.ts`  
**Risk:** Requests with forged/expired/tampered session cookies bypass middleware gate

The middleware only checks for cookie *presence*, not validity:

```typescript
const session = request.cookies.get("scantient-session");

if (!session?.value) {
  // Only empty cookie triggers rejection
}
// Any non-empty value passes — including expired or forged JWTs
return NextResponse.next();
```

While individual routes call `getSession()` (which does verify the JWT), the middleware provides a false security boundary. Routes that incorrectly rely on middleware having validated the token are silently vulnerable. There are also informational leaks — e.g., the dashboard page renders before the API call confirms auth.

**Recommended Fix:**
Add lightweight JWT verification in middleware using the Edge Runtime-compatible `jose` library:

```typescript
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
try {
  await jwtVerify(session.value, secret);
} catch {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

---

### H-2: Jira API Token Protected Only by XOR Obfuscation (Not Encryption)

**File:** `src/lib/crypto-util.ts`  
**Risk:** API tokens stored in DB can be trivially decoded; key derivation fallback "default-secret" compounds risk

```typescript
// XOR with JWT_SECRET as key — this is NOT encryption
export function obfuscate(value: string): string {
  const secret = process.env.JWT_SECRET ?? "default-secret"; // falls back to known string
  ...XOR loop...
}
```

Issues:
1. XOR obfuscation provides zero cryptographic security — it's trivially reversible with the key.
2. The key itself (`JWT_SECRET`) is stored alongside the data it "protects" (same Vercel environment).
3. The fallback `"default-secret"` means that if JWT_SECRET differs between environments, tokens stored in one environment cannot be decoded in another — causing silent failures.
4. The fallback key is different from the SSO fallback (`"fallback-secret"`) — inconsistency.
5. SSO `clientSecret` is stored directly in the `SSOConfig` model as a plain string (not obfuscated).

**Recommended Fix:**
- Replace XOR with AES-256-GCM encryption using `node:crypto`:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

export function encrypt(value: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "hex"); // 32-byte hex key
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}
```
- Use a separate `ENCRYPTION_KEY` env var (not re-using JWT_SECRET).
- Encrypt SSO `clientSecret` at rest in the `SSOConfig` model.

---

### H-3: API Key Exposed in URL Query Parameter (Badge Endpoint)

**File:** `src/app/api/public/badge/route.ts`  
**Risk:** API keys appear in server access logs, browser history, referer headers, CDN logs, analytics tools

```typescript
// GET /api/public/badge?url=https://example.com&key=vs_abc123
const key = searchParams.get("key");
```

API keys should never be in URLs. They will be logged by Vercel, any CDN, any proxy, browser history, and could be leaked in `Referer` headers when the badge image is embedded.

**Recommended Fix:**
Switch to an HMAC-signed URL approach where the badge URL contains a signed token (not the API key itself), or accept the key in a request header. For badge use cases, generate a separate read-only badge token that cannot trigger scans:

```typescript
// Generate a separate badge_token scoped to read-only badge display
// Store hash in DB, serve via: /api/public/badge?token=<badge_token>
```

---

### H-4: Newsletter Subscribe Endpoint Has No Rate Limiting

**File:** `src/app/api/newsletter/subscribe/route.ts`  
**Risk:** Email bombing — attacker can send unlimited emails to arbitrary addresses at Resend API cost; potential abuse for phishing or reputation damage

The endpoint accepts any valid email address and sends a welcome email with no rate limiting whatsoever. An attacker can:
- Spam any victim's inbox by submitting their email thousands of times.
- Exhaust Resend API send limits.
- Harm sender reputation (high complaint rate).

**Recommended Fix:**
```typescript
const ip = getClientIp(req);
const limit = await checkRateLimit(`newsletter:${ip}`, {
  maxAttempts: 3,
  windowMs: 60 * 60 * 1000,
  fallbackMode: "fail-closed",
});
if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
```
Also consider tracking per-email submissions to prevent the same email from being subscribed multiple times from different IPs.

---

### H-5: npm Audit — 5 HIGH Severity Vulnerabilities in @sentry/nextjs

**Location:** `package.json` (transitive dependencies)  
**Risk:** Build-time vulnerabilities in webpack/terser could be exploited in CI/CD pipeline; known CVEs

```
HIGH  @sentry/nextjs        >=8.0.0-alpha.2
HIGH  @sentry/webpack-plugin >=2.2.1
HIGH  serialize-javascript   <=7.0.2
HIGH  terser-webpack-plugin  * (all versions)
HIGH  webpack               >=4.26.0
```

All 5 findings trace back to the `@sentry/nextjs` dependency. The fix requires a major version upgrade:

**Recommended Fix:**
```bash
npm install @sentry/nextjs@7.120.4
```
Note: This is a major version bump — test Sentry instrumentation thoroughly after upgrade.

---

## 🟡 MEDIUM — Fix This Sprint

---

### M-1: Content Security Policy Allows `unsafe-eval` and `unsafe-inline`

**File:** `next.config.ts`  
**Risk:** CSP is effectively neutralized — XSS attacks will execute without CSP blocking them

```typescript
"Content-Security-Policy",
"default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; ..."
```

`'unsafe-eval'` allows `eval()`, `Function()`, and dynamic code execution. `'unsafe-inline'` allows inline `<script>` blocks. Together they make the CSP nearly useless against XSS.

**Recommended Fix:**
Use nonce-based CSP (Next.js supports this natively):
```typescript
// middleware.ts — generate nonce per request
import { nanoid } from "nanoid";
const nonce = nanoid();
// Pass nonce via header and use it in CSP:
"script-src 'self' 'nonce-${nonce}'"
```
Or at minimum remove `unsafe-eval` — Next.js 13+ App Router doesn't require it.

---

### M-2: Overly Permissive CORS (`Access-Control-Allow-Origin: *`)

**Location:** Live site headers (likely Vercel default)  
**Risk:** Any website can make cross-origin requests to the Scantient API using credentials stored in browser


The live site returns `access-control-allow-origin: *` for all responses. For a SaaS product with session-cookie auth, this should be restricted to the application's own origin.

**Recommended Fix:**
Add CORS configuration in `next.config.ts` or middleware:
```typescript
// Only allow your own origin for credentialed requests
const allowedOrigins = ["https://scantient.com"];

headers: { "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : "" }
```

---

### M-3: Login Does Not Enforce Email Verification

**File:** `src/app/api/auth/login/route.ts`  
**Risk:** Unverified users (e.g., from account enumeration or compromised signup) can access the application

```typescript
// login/route.ts — missing check
const valid = await verifyPassword(password, user.passwordHash);
if (!valid) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
// No: if (!user.emailVerified) return 403
```

Users who never verified their email can log in with full access. Attackers who compromise a signup flow can gain entry without verifying their identity.

**Recommended Fix:**
```typescript
if (!user.emailVerified) {
  return NextResponse.json({ error: "Please verify your email before logging in." }, { status: 403 });
}
```

---

### M-4: JWT Tokens Missing Explicit Algorithm, Audience, and Issuer Claims

**File:** `src/lib/auth.ts`  
**Risk:** JWT confusion attacks; tokens issued for one purpose could be accepted in another context

```typescript
// No algorithm, audience, or issuer specified:
jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_DURATION });
```

The default HS256 algorithm is used implicitly. Without explicit `aud` and `iss` claims:
- A session token could potentially be used where a password-reset token is expected (if `purpose` claim isn't validated).
- Cross-context token reuse is not prevented at the JWT layer.

**Recommended Fix:**
```typescript
jwt.sign(payload, JWT_SECRET, {
  algorithm: "HS256",
  expiresIn: SESSION_DURATION,
  issuer: "scantient",
  audience: "scantient-app",
});
// Verify with:
jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"], issuer: "scantient", audience: "scantient-app" });

```

---

### M-5: Rate Limit Uses `fail-open` for Password Reset Flows

**Files:** `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/reset-password/route.ts`  
**Risk:** In multi-instance production (without Redis configured), brute-force attacks on reset tokens are unprotected

```typescript
// forgot-password and reset-password both use:
fallbackMode: "fail-open"
// This means: if Redis is unavailable, fall back to per-instance in-memory store
// With multiple Vercel instances, each has its own in-memory store = no protection
```

The `reset-password` endpoint allows 10 attempts per hour per IP — high enough to be exploited if rate limiting fails.

**Recommended Fix:**
1. Configure Upstash Redis (already scaffolded in env vars — just needs to be provisioned).
2. Change both routes to `fallbackMode: "fail-closed"`.
3. Lower `reset-password` maxAttempts to 5.

---

### M-6: Health Endpoint Leaks Operational Metrics Without Auth

**File:** `src/app/api/health/route.ts`  
**Risk:** Information disclosure — reveals monitored app count and last scan timestamp to unauthenticated callers

```json
{
  "status": "healthy",
  "monitoredApps": 47,
  "lastScan": { "at": "2026-02-28T22:00:01.000Z", "status": "HEALTHY" },
  ...
}
```

While health endpoints are commonly public, exposing `monitoredApps` count and scan details gives attackers useful intelligence about the platform's usage patterns and timing.

**Recommended Fix:**
Return only the minimal status needed for load balancer health checks when unauthenticated:
```typescript
// Public: { status: "healthy" | "degraded", timestamp: "..." }
// Authenticated: full details including metrics
```

---

### M-7: Cron Endpoint Unprotected When `CRON_SECRET` Is Unset

**File:** `src/app/api/cron/run/route.ts`  
**Risk:** Unauthenticated users can trigger mass scans, exhaust credits, and generate false alerts

```typescript
if (!cronSecret) {
  console.warn("[cron] WARNING: CRON_SECRET is not set. Cron endpoint is unprotected (dev mode).");
  // Continues executing — no early return!
}
```

The `.env` contains `CRON_SECRET="dev-secret-replace-in-production"` — a predictable value. If a developer deploys without setting this, the endpoint becomes fully open.

**Recommended Fix:**
```typescript
if (!cronSecret) {
  return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
}
```
Also ensure `vercel.json` cron runs use the Vercel `CRON_SECRET` auto-injection (already partially configured).

---

## 🔵 LOW / INFO

---

### L-1: Password Policy — Only 8-Character Minimum, No Complexity Requirements

**File:** `src/app/api/auth/signup/route.ts`  
**Risk:** Weak passwords; moderate credential stuffing risk

```typescript
password: z.string().min(8, "Password must be at least 8 characters")
```

No requirement for uppercase, numbers, or special characters.

**Recommended Fix:**
```typescript
password: z.string().min(12).regex(
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
  "Password must contain uppercase, lowercase, and a number"
)
```
Or integrate a password strength library like `zxcvbn`.

---

### L-2: `DIRECT_URL` Configured Same as Pooled `DATABASE_URL`

**File:** `.env`  
**Risk:** Prisma migrations may fail or behave unexpectedly when run against pooler URL

```
DATABASE_URL="...pooler.c-4...neon.tech/neondb?..."
DIRECT_URL="...pooler.c-4...neon.tech/neondb?..."  # Should be direct, non-pooled URL
```

`DIRECT_URL` should point to the direct (non-pgbouncer) Neon endpoint for migrations. Using the pooler URL for both can cause issues with schema migrations.

**Recommended Fix:**
In the Neon console, copy the "direct connection" URL (not the pooled one) and set it as `DIRECT_URL`.

---

### L-3: SSO `clientSecret` Stored as Plaintext in `SSOConfig` Table

**File:** `prisma/schema.prisma`, `src/app/api/integrations/sso/route.ts`  
**Risk:** If DB is compromised, SSO client secrets are exposed directly

The `SSOConfig` model has `clientSecret String?` as a plain field. Unlike the Jira integration (which uses `obfuscate()`), the SSO client secret appears to be stored without any obfuscation.

**Recommended Fix:**
Apply the same `obfuscate()` (or better, AES-256 encryption per C-2 fix) to `clientSecret` before storing in `SSOConfig`.

---

### L-4: Missing `httpOnly` Cookie Flag When `NODE_ENV !== "production"`

**File:** `src/lib/auth.ts`  
**Risk:** In development/staging, session cookies may be accessible to JavaScript

```typescript
cookieStore.set(SESSION_COOKIE, token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // secure only in prod
  ...
});
```

The `secure` flag being absent in non-production is expected and acceptable for local development. However, consider whether staging environments also qualify for `secure: true`.

**Recommended Fix:**
```typescript
secure: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "preview"
```

---

### L-5: Dashboard Route Has Two Separate Sequential DB Queries for App Counts

**File:** `src/app/api/dashboard/route.ts`  
**Risk:** Mild performance inefficiency — extra round-trip to DB

```typescript
// Inside Promise.all:
db.monitoredApp.count({ where: { orgId } })
// After Promise.all resolves — a second count query:
const healthyApps = await db.monitoredApp.count({ where: { orgId, status: "HEALTHY" } });
```

The `healthyApps` count runs sequentially after the `Promise.all` block instead of being included in it.

**Recommended Fix:**
Include `healthyApps` in the `Promise.all`:
```typescript
const [apps, criticalFindings, recentRuns, healthyApps] = await Promise.all([
  db.monitoredApp.count({ where: { orgId: session.orgId } }),
  ...
  db.monitoredApp.count({ where: { orgId: session.orgId, status: "HEALTHY" } }),
]);
```

---

## HTTP Security Headers Assessment

Fetched from: `https://scantient.com`


| Header | Status | Value |
|---|---|---|
| `Strict-Transport-Security` | ✅ Pass | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | ✅ Pass | `DENY` |
| `X-Content-Type-Options` | ✅ Pass | `nosniff` |
| `Referrer-Policy` | ✅ Pass | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | ✅ Pass | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | ⚠️ Weak | `unsafe-eval` + `unsafe-inline` in `script-src` — see M-1 |
| `Access-Control-Allow-Origin` | ⚠️ Broad | `*` — see M-2 |
| `X-XSS-Protection` | ℹ️ Absent | Deprecated; modern browsers use CSP instead |

**Header Score: 6/8** (Good foundation, CSP needs hardening)

---

## Performance Assessment

### Load Time (curl from audit server)

| Metric | Value |
|---|---|
| DNS lookup | 3.7ms |
| TCP connect | 4.2ms |
| TLS handshake | 51.4ms |
| Time to first byte | 90.5ms |
| Total | **91.4ms** |
| Page size | 110 KB |

**TTFB of 91ms is excellent** — Vercel CDN prerendering is working correctly.

### Next.js Configuration (`next.config.ts`)

| Check | Status |
|---|---|
| Security headers | ✅ Configured |
| Sentry integration | ✅ Present |
| Source maps | ✅ Disabled in production |
| Turbopack | ✅ Enabled |
| Image optimization | ℹ️ Default (not customized) |

### N+1 Query Analysis

| Route | Pattern | Risk |
|---|---|---|
| `GET /api/apps` | `findMany` with `include: { monitorRuns: { include: { findings } } }` | ⚠️ Each app loads runs+findings — consider pagination depth limits |
| `GET /api/dashboard` | `Promise.all` + sequential `healthyApps` count | 🔵 Minor (see L-5) |
| `GET /api/apps/[id]` | `include { monitorRuns: { take: 20 } }` | ✅ Bounded and indexed |
| `GET /api/findings` | Deep join via `run.app.orgId` | ✅ Single query, indexed |

No severe N+1 patterns detected. Prisma handles JOINs efficiently. The `apps` route loads `take: 1` run per app (correctly bounded).

### Bundle & Caching

- `Cache-Control: public, max-age=0, must-revalidate` on HTML — appropriate for dynamic pages
- Static assets served with long-cache headers by Vercel CDN
- No custom image domain configuration in `next.config.ts` — defaults are fine but consider `images.formats: ['image/avif', 'image/webp']` for optimization

### Performance Score: 82/100

Deductions:
- (-8) Missing explicit image format optimization
- (-5) apps route loads full findings tree for all apps (unbounded depth could be slow with high finding counts)
- (-5) No explicit connection pool tuning (Prisma default is 5 connections; Neon pooler handles this)

---

## Infrastructure & Config Assessment

### `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/run", "schedule": "0 */4 * * *" },
    { "path": "/api/reports/weekly", "schedule": "0 12 * * 1" }
  ]
}
```

**Observations:**
- ✅ Cron schedules are correctly configured
- ⚠️ No `headers` configuration — all security headers are managed in `next.config.ts` (acceptable but fragile)
- ⚠️ No `redirects` configured — consider adding `http://` → `https://` redirect (Vercel may handle this by default)
- ℹ️ `/api/reports/weekly` cron has no visible auth protection in the route file reviewed

### `.env.example`

Well-structured with clear documentation. No actual secret values present. Appropriate placeholder values for all keys.

**Minor issue:** `RATE_LIMIT_FALLBACK_MODE="fail-open"` is the default in the example file. This should be `"fail-closed"` for production environments.

### Prisma / Database

- ✅ All Prisma queries use parameterized ORM calls (no raw SQL injection risk — the single `$queryRaw\`SELECT 1\`` is a safe tagged template literal)
- ✅ Multi-tenant isolation enforced via `orgId` scoping on all data access functions
- ✅ Cascade delete configured on all `orgId` foreign keys
- ⚠️ No connection pool size configuration in `db.ts` (relies on Prisma default of 5 connections)
- ⚠️ `DIRECT_URL` is same as pooled `DATABASE_URL` in `.env` (see L-2)

---

## Dependency Summary

```
npm audit result: 0 critical, 5 high, 0 moderate, 0 low
```

All 5 high findings are in `@sentry/nextjs` and its build-time dependencies (webpack, terser). Fix available via upgrade to `@sentry/nextjs@7.120.4` (major version change).

---

## Prioritized Remediation Checklist

### This Hour (Critical)
- [ ] **Rotate Neon DB password** — the one in `.env` is exposed
- [ ] **Remove `.env` from git** (add to `.gitignore`, purge history)
- [ ] **Rotate JWT_SECRET** — current value is weak and predictable
- [ ] **Fix SSO fallback secret** — replace `?? "fallback-secret"` with throw

### This Week (High)
- [ ] Add SSRF blocklist for private IP ranges in scanner and public/score endpoint
- [ ] Add JWT verification to middleware (use `jose` for Edge Runtime)
- [ ] Replace XOR obfuscation with AES-256-GCM encryption in `crypto-util.ts`
- [ ] Move badge API key out of URL query params
- [ ] Add rate limiting to newsletter subscribe endpoint
- [ ] Upgrade `@sentry/nextjs` to 7.x (5 high CVEs)

### This Sprint (Medium)
- [ ] Harden CSP — remove `unsafe-eval`, implement nonce-based CSP
- [ ] Restrict CORS to application origin
- [ ] Add `emailVerified` check to login route
- [ ] Add explicit JWT `algorithm`, `iss`, and `aud` claims
- [ ] Set rate limit fallback mode to `fail-closed` for auth endpoints
- [ ] Reduce health endpoint response to minimal data for unauthenticated requests
- [ ] Make cron endpoint return 503 when `CRON_SECRET` is not set

### Nice to Have (Low)
- [ ] Strengthen password complexity requirements
- [ ] Fix `DIRECT_URL` to use Neon direct (non-pooled) connection string
- [ ] Encrypt SSO `clientSecret` at rest
- [ ] Move `healthyApps` count into the `Promise.all` block in dashboard route
- [ ] Add `images.formats: ['image/avif', 'image/webp']` to `next.config.ts`

---

## Grading Summary

| Dimension | Score | Grade |
|---|---|---|
| Secrets Management | 20/100 | F |
| Authentication | 65/100 | D |
| Authorization / Tenant Isolation | 85/100 | B |
| Input Validation | 80/100 | B |
| HTTP Security Headers | 72/100 | C |
| Dependency Security | 70/100 | C |
| Rate Limiting | 75/100 | C |
| SSRF / Injection Protection | 40/100 | F |
| Performance | 82/100 | B |
| **Overall Security Grade** | — | **D** |

The application has a solid foundation — Zod validation throughout, Prisma ORM (no raw SQL), good tenant isolation, bcrypt for passwords, and rate limiting on auth endpoints. However, the committed production credentials (C-1), hardcoded fallback secrets (C-2), and SSRF vulnerability (C-3) are severe enough to prevent a passing grade until remediated.

---

*Report generated by OpenClaw Security Audit Agent. Findings reflect the state of the codebase at commit `8de2ab2` on 2026-02-28.*
