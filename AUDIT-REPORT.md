# VibeSafe Comprehensive Audit Report

**Date:** 2026-02-28  
**Auditor:** Automated Code Audit  
**Target:** https://vibesafe-two.vercel.app  
**Codebase:** /home/clawuser/.openclaw/workspace/vibesafe

---

## Executive Summary

| Area | Grade | Summary |
|------|-------|---------|
| **Performance** | **B-** | No dynamic imports for heavy libs (recharts, jsPDF). Cron can timeout scanning 50 apps sequentially. No major N+1 issues. |
| **Security** | **C+** | Hardcoded JWT fallback secret, no CSRF protection, no rate limiting, missing CSP/X-Frame-Options headers, MCP endpoint unauthenticated, weekly report endpoint leaks cross-tenant data. |
| **Functionality** | **C** | App/user limits enforced. But PDF reports NOT gated by tier, API keys NOT gated by tier, alert channels NOT gated by tier, SSO is UI-only placeholder, scan frequency doesn't vary by tier. |

---

## PART 1: PERFORMANCE AUDIT

### P-1: No Dynamic Imports for Heavy Libraries
**Severity:** MEDIUM  
**Files:** `src/components/trend-chart.tsx`, `src/lib/pdf-report.ts`  
**Description:** `recharts` (~200KB) is imported statically in trend-chart.tsx (a client component). `jspdf` (~300KB) is imported statically in pdf-report.ts (server-side, less critical but still bloats serverless cold starts).  
**Fix:** Use `next/dynamic` for trend-chart. jsPDF is server-only so less urgent but could use lazy `await import()`.

### P-2: Cron Job Sequential Scanning — Timeout Risk
**Severity:** HIGH  
**File:** `src/lib/scanner-http.ts` → `runDueHttpScans()`  
**Description:** Scans run sequentially with `for...of` loop. Each scan fetches HTML + up to 15 JS assets with 10s timeouts each. Scanning 50 apps (Enterprise limit) could take 50 × 30s+ = 25+ minutes, far exceeding Vercel's 60s Pro function limit.  
**Fix:** 
1. Process apps in parallel batches (e.g., `Promise.allSettled` with concurrency limit of 5)
2. Or split into multiple cron invocations (process 5-10 per run, run cron more frequently)
3. Consider Vercel's background functions or a queue-based approach

### P-3: N+1 Query in Dashboard
**Severity:** LOW  
**File:** `src/app/api/dashboard/route.ts`  
**Description:** Dashboard makes 4 parallel queries which is fine (uses `Promise.all`). Apps list includes nested `monitorRuns` with `findings` — acceptable with `take: 1`. No N+1 issues found.

### P-4: Missing Database Indexes
**Severity:** LOW  
**Description:** Schema has good indexes on `[orgId]`, `[orgId, status]`, `[appId, startedAt]`, `[runId, severity]`, `[status]`. The `nextCheckAt` field used in cron queries lacks an index.  
**File:** `prisma/schema.prisma` → `MonitoredApp` model  
**Fix:** Add `@@index([nextCheckAt])` to MonitoredApp.

### P-5: Middleware Performance
**Severity:** LOW  
**File:** `src/middleware.ts`  
**Description:** Middleware only checks cookie existence (no JWT verification, no DB calls). Very lightweight — no performance concern.

### P-6: Unused Dependencies
**Severity:** LOW  
**File:** `package.json`  
**Description:** `@auth/prisma-adapter` and `next-auth` are listed but no NextAuth configuration exists — the app uses custom JWT auth. These add unnecessary install weight.  
**Fix:** Remove `@auth/prisma-adapter` and `next-auth` from dependencies.

---

## PART 2: SECURITY AUDIT

### S-1: Hardcoded JWT Fallback Secret — CRITICAL
**Severity:** CRITICAL  
**File:** `src/lib/auth.ts:7`  
**Description:** `const JWT_SECRET = process.env.JWT_SECRET ?? "vibesafe-dev-secret-change-in-production"`. If `JWT_SECRET` env var is not set in production, anyone can forge session tokens using this publicly-visible fallback.  
**Fix:** Remove fallback. Throw an error if `JWT_SECRET` is missing: `const JWT_SECRET = process.env.JWT_SECRET; if (!JWT_SECRET) throw new Error("JWT_SECRET required");`

### S-2: No CSRF Protection
**Severity:** HIGH  
**File:** `src/lib/auth.ts`, `src/middleware.ts`  
**Description:** Cookie-based auth with `sameSite: "lax"` provides partial CSRF protection (blocks cross-origin POST from forms), but AJAX requests with `fetch()` from malicious sites can still execute if the browser sends cookies. No CSRF token is implemented.  
**Fix:** Implement double-submit cookie pattern or use `sameSite: "strict"`.

### S-3: No Rate Limiting on Auth Endpoints
**Severity:** HIGH  
**Files:** `src/app/api/auth/login/route.ts`, `src/app/api/auth/signup/route.ts`  
**Description:** No rate limiting on login or signup. Enables brute-force password attacks and signup abuse.  
**Fix:** Add rate limiting via Vercel Edge middleware or an in-memory/Redis counter. At minimum, add exponential backoff after failed logins.

### S-4: Missing Security Headers (Self-Scan)
**Severity:** HIGH  
**File:** `next.config.ts` (no headers configured)  
**Description:** Deployed site response headers show:
- ❌ No `Content-Security-Policy`
- ❌ No `X-Frame-Options`
- ❌ No `X-Content-Type-Options`
- ❌ No `Permissions-Policy`
- ❌ No `Referrer-Policy`
- ✅ `Strict-Transport-Security` (provided by Vercel)
- ⚠️ `Access-Control-Allow-Origin: *` (overly permissive CORS)

**Fix:** Add security headers in `next.config.ts` or middleware:
```ts
headers: async () => [{ source: "/(.*)", headers: [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "default-src 'self'; ..." },
]}]
```

### S-5: MCP Endpoint Completely Unauthenticated
**Severity:** HIGH  
**File:** `src/app/api/mcp/route.ts`  
**Description:** The MCP JSON-RPC endpoint has NO authentication. It currently returns mock data, but if connected to real data, anyone could query all apps, findings, and trigger scans. Middleware skips it because it's not explicitly protected.  
**Fix:** Add API key or session authentication before it goes live.

### S-6: Weekly Report Endpoint Leaks Cross-Tenant Data
**Severity:** CRITICAL  
**File:** `src/app/api/reports/weekly/route.ts`  
**Description:** The weekly report endpoint queries ALL `monitoredApp` records across ALL organizations with no orgId filter. Any caller with `CRON_SECRET` gets every org's data. This is a multi-tenant isolation failure.  
**Fix:** Add orgId scoping: `db.monitoredApp.findMany({ where: { orgId: ... } })` or iterate per-org.

### S-7: Stripe Webhook Signature Verification
**Severity:** LOW (properly implemented)  
**File:** `src/app/api/stripe/webhook/route.ts`  
**Description:** ✅ Correctly uses `getStripe().webhooks.constructEvent(body, sig, secret)`. Properly reads raw body with `req.text()`.

### S-8: Tenant Isolation Review
**Severity:** MEDIUM (mostly good, with exceptions)  
**Description:** Review of all API routes:
- ✅ `/api/apps` — scoped by `session.orgId`
- ✅ `/api/apps/[id]` — uses `findFirst({ where: { id, orgId } })`
- ✅ `/api/dashboard` — scoped by `session.orgId`
- ✅ `/api/team` — scoped by `session.orgId`
- ✅ `/api/alerts` — scoped by `session.orgId`
- ✅ `/api/alerts/[id]` — scoped by `session.orgId`
- ✅ `/api/alerts/test` — verifies config belongs to org
- ✅ `/api/keys` — scoped by `session.orgId`
- ✅ `/api/findings/[id]` — verifies finding → run → app → orgId
- ✅ `/api/findings/[id]/assign` — verifies org ownership
- ✅ `/api/v1/*` — scoped by API key's orgId
- ✅ `/api/scan/[id]` — verifies app belongs to org
- ❌ `/api/reports/weekly` — **NO org scoping** (see S-6)
- ⚠️ `/api/mcp` — returns mock data, no auth (see S-5)

### S-9: No Input Validation on Some Endpoints
**Severity:** MEDIUM  
**File:** `src/app/api/alerts/[id]/route.ts`  
**Description:** PATCH endpoint accepts `body.enabled` without Zod validation. While Prisma parameterizes queries (preventing SQL injection), lack of schema validation could allow unexpected fields.  
**Fix:** Add Zod schema for all PATCH/POST bodies.

### S-10: JWT Session Data Goes Stale
**Severity:** MEDIUM  
**File:** `src/lib/auth.ts`  
**Description:** User data (role, orgId, orgName) is embedded in the JWT at login and not refreshed for 7 days. If a user's role is changed or they're removed from an org, the stale JWT still grants access.  
**Fix:** Either shorten JWT expiry or add DB validation on sensitive operations.

### S-11: .env File Exists on Disk
**Severity:** LOW  
**File:** `.env` (1188 bytes on disk)  
**Description:** `.env` exists but is in `.gitignore` ✅. Not committed to repo. `.env.example` also exists ✅.

---

## PART 3: FUNCTIONALITY AUDIT (Tier Alignment)

### F-1: App Limit Enforcement — ✅ WORKING
**Severity:** N/A  
**File:** `src/lib/tenant.ts` → `canAddApp()`, called in `src/app/api/apps/route.ts`  
**Description:** Correctly checks `db.monitoredApp.count({ where: { orgId } })` against tier limits (FREE=2, STARTER=5, PRO=15, ENTERPRISE=50).

### F-2: User/Team Limit Enforcement — ✅ WORKING
**Severity:** N/A  
**File:** `src/lib/tenant.ts` → `canAddUser()`, called in `src/app/api/team/route.ts`  
**Description:** Correctly checks user count against tier limits (FREE=1, STARTER=2, PRO=5, ENTERPRISE=999).

### F-3: PDF Reports NOT Gated by Tier
**Severity:** HIGH  
**File:** `src/app/api/reports/pdf/route.ts`  
**Description:** Any authenticated user can generate PDF compliance reports. The pricing page says "PDF compliance reports" is Enterprise-only, but the API route has no tier check.  
**Fix:** Add tier check: `const limits = await getOrgLimits(session.orgId); if (!['PRO','ENTERPRISE'].includes(limits.tier)) return 403;`

### F-4: API Keys NOT Gated by Tier
**Severity:** HIGH  
**File:** `src/app/api/keys/route.ts`  
**Description:** Any authenticated user can create API keys. The pricing page says "API access" is Pro+ only, but there's no tier check.  
**Fix:** Add tier gate in POST handler.

### F-5: Alert Channels NOT Gated by Tier
**Severity:** HIGH  
**File:** `src/app/api/alerts/route.ts`  
**Description:** Any user can create EMAIL, SLACK, or WEBHOOK alert configs. Pricing page says:
- STARTER: Email alerts only
- PRO: Email + Slack alerts  
- ENTERPRISE: All alert channels

No tier-based channel restrictions exist in code.  
**Fix:** Check tier before allowing non-EMAIL channels.

### F-6: SSO is UI-Only Placeholder
**Severity:** MEDIUM  
**File:** `src/app/(dashboard)/settings/sso/page.tsx`  
**Description:** SSO page shows Enterprise gate UI correctly, but:
1. `isEnterprise` is hardcoded to `false` — never actually checks the org's tier
2. The form's "Save" does nothing (no API endpoint exists)
3. No actual SAML/SSO implementation exists

This is fine for an MVP if disclosed, but the pricing page lists it as a feature.  
**Fix:** Either implement SSO or mark it as "Coming Soon" on the pricing page.

### F-7: Scan Frequency Does NOT Vary by Tier
**Severity:** MEDIUM  
**File:** `src/lib/scanner-http.ts:87`  
**Description:** All apps get `nextCheckAt: addHours(new Date(), 4)` — fixed 4-hour intervals regardless of tier. Pricing page says Enterprise gets "1-hour scan intervals."  
**Fix:** Look up org tier and set interval accordingly: Enterprise=1h, others=4h.

### F-8: Pricing Page Accuracy
**Severity:** HIGH  
**File:** `src/app/page.tsx`  
**Description:** Multiple discrepancies between pricing page claims and actual code enforcement:

| Feature | Pricing Page Says | Code Reality |
|---------|-------------------|--------------|
| PDF compliance reports | Enterprise only | Available to ALL users |
| API access | Pro+ only | Available to ALL users |
| Alert channels | Tiered | All channels available to ALL |
| SSO/SAML | Enterprise | UI placeholder, not implemented |
| 1-hour scan intervals | Enterprise | All tiers get 4-hour |
| Remediation workflow | Pro+ | Available to ALL (finding status updates) |
| Audit log | Pro+ | Available to ALL (logAudit called for everyone) |

### F-9: FREE Tier Not Listed on Pricing Page
**Severity:** LOW  
**File:** `src/app/page.tsx`  
**Description:** Pricing page shows Starter/Pro/Enterprise but no Free tier. Users signing up get FREE with 2 apps, 1 user, 14-day trial. This is fine — just noting it.

### F-10: No Trial Expiry Enforcement
**Severity:** MEDIUM  
**File:** `src/lib/tenant.ts`, `src/app/api/auth/signup/route.ts`  
**Description:** Signup creates a 14-day trial (`trialEndsAt`), but `getOrgLimits()` returns `trialEndsAt` without checking if it's expired. A FREE tier trial that expires still gets full FREE tier access indefinitely. If the intent is to restrict after trial, this is not enforced.

---

## Prioritized Action Items

### 🔴 CRITICAL (Fix Immediately)
1. **S-1:** Remove hardcoded JWT fallback secret — anyone can forge tokens if env var is missing
2. **S-6:** Fix weekly report cross-tenant data leak — add orgId scoping

### 🟠 HIGH (Fix Before Launch)
3. **S-3:** Add rate limiting on login/signup endpoints
4. **S-4:** Add security headers (CSP, X-Frame-Options, X-Content-Type-Options)
5. **S-5:** Add authentication to MCP endpoint
6. **F-3:** Gate PDF reports by tier (PRO+)
7. **F-4:** Gate API key creation by tier (PRO+)
8. **F-5:** Gate alert channels by tier
9. **F-8:** Align pricing page with actual feature enforcement
10. **P-2:** Fix cron sequential scanning to avoid Vercel timeout

### 🟡 MEDIUM (Fix Soon)
11. **S-2:** Implement CSRF protection
12. **S-9:** Add Zod validation to all PATCH endpoints
13. **S-10:** Address stale JWT session data
14. **F-6:** Implement real SSO or mark as "Coming Soon"
15. **F-7:** Implement tier-based scan frequency
16. **F-10:** Enforce trial expiry

### 🟢 LOW (Nice to Have)
17. **P-1:** Dynamic imports for recharts
18. **P-4:** Add index on `nextCheckAt`
19. **P-6:** Remove unused `next-auth` and `@auth/prisma-adapter` dependencies
20. **F-9:** Consider showing Free tier on pricing page

---

*End of audit report.*
