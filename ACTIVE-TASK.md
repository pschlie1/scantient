# ACTIVE-TASK.md

## Status: COMPLETE — All 4 PRs Created

## PRs Created
| PR | Branch | Description |
|----|--------|-------------|
| #65 | fix/scanner-accuracy | DANGEROUS_INNER_HTML false positive fix |
| #66 | fix/csp-inline-scripts | Nonce-based CSP + INLINE_SCRIPTS scanner check |
| #67 | feat/tier2-subsystem-probe | Tier 2 probe client + MonitorRun.probeResult |
| #68 | feat/url-context-classifier | URL context classifier (checkAPISecurity → api-endpoint only) |

---

## Final Scan Analysis (scantient.com — live production)

**Cannot trigger live scan** — production CRON_SECRET differs from .env.local; endpoint returned 500.

**Current score (before PRs):** 86/B — 2 open MEDIUM findings.

### DANGEROUS_INNER_HTML Analysis

Fetched live homepage HTML and inspected inline scripts. Finding root cause confirmed:

1. Next.js RSC payload ships inline `<script>self.__next_f.push(...)` tags
2. The RSC JSON contains the React component tree, which encodes `dangerouslySetInnerHTML` as a JSON key: `\"dangerouslySetInnerHTML\":{\"__html\":...}` (escaped within a JS string literal)
3. **Old scanner code** (`/dangerouslySetInnerHTML/i` bare string): MATCHES the escaped string → false positive fires
4. **New scanner code** (`/dangerouslySetInnerHTML\s*[:=]\s*\{/i` requiring assignment context): Does NOT match — the `\"` (backslash-quote) between `InnerHTML` and `:` breaks the pattern
5. **Expected after PR #65 deploys:** DANGEROUS_INNER_HTML finding clears ✓

The marketing text "...dangerouslySetInnerHTML usage..." in page.tsx also contributed — appears in RSC/JSON without assignment context → also correctly excluded by fix ✓

### NO_RATE_LIMITING Analysis

Path guard in security.ts is correct (`isApiPath` check). `checkAPISecurity(html, headers, "https://scantient.com")` → pathname is `/` → `isApiPath = false` → finding does not fire. Issue was timing: PR #64 merged ~1 min before scan ran. No code change needed.

**Expected after fresh scan:** NO_RATE_LIMITING clears ✓

### INLINE_SCRIPTS Analysis

Live homepage has 10+ inline `<script>` blocks (Next.js RSC hydration). Current CSP uses `unsafe-inline` (no nonce). After PR #66:
- Scanner check added: would fire as LOW (CSP exists but uses unsafe-inline)
- BUT: middleware now generates per-request nonce CSP with `'nonce-{nonce}' 'strict-dynamic'`
- Scanner checks for `'nonce-'` in CSP → suppresses finding
- **Expected after PR #66 deploys:** INLINE_SCRIPTS finding suppressed ✓

### Expected Score After PRs Merge

| Finding | Before PRs | After PR #65 | After PR #66 |
|---------|------------|--------------|--------------|
| DANGEROUS_INNER_HTML (MEDIUM) | OPEN | CLEARED | CLEARED |
| NO_RATE_LIMITING (MEDIUM) | OPEN | CLEARED | CLEARED |
| INLINE_SCRIPTS (LOW/MEDIUM) | N/A | N/A | SUPPRESSED |

**Projected score:** 86/B → **~92-94/A** (removing 2 MEDIUM findings)

---

## Part 1 ✅ — fix/scanner-accuracy (PR #65)
- Fixed DANGEROUS_INNER_HTML: changed `hasScriptUsage` from bare string match to assignment context `/dangerouslySetInnerHTML\s*[:=]\s*\{/i`
- Added 2 new tests (false positive prevention + compiled JS true positive)
- TypeScript: PASSES

## Part 2 ✅ — fix/csp-inline-scripts (PR #66)
- Added `checkInlineScriptCount(html, headers)` to security.ts
  - MEDIUM if no CSP; LOW if unsafe-inline; suppressed if nonce/hash/strict-dynamic
  - Integrated into scanner-http.ts
- Updated middleware.ts: per-request nonce CSP (`'nonce-{nonce}' 'strict-dynamic' 'unsafe-inline'`)
- Updated layout.tsx: reads `x-nonce` from `next/headers`, applies to JSON-LD `<script>`
- Added 5 new tests for checkInlineScriptCount
- TypeScript: PASSES

## Part 3 ✅ — feat/tier2-subsystem-probe (PR #67)
- Created `src/lib/probe-client.ts` with Zod validation (ProbeResultSchema)
- Added `probeResult Json?` to MonitorRun Prisma schema
- Migration: `20260302050000_add_probe_result_to_monitor_run` — applied to production
- Integrated probe into scanner-http.ts (after main scan, non-fatal)
- Created `docs/probe-spec.md` (full spec + Next.js + Express examples)
- TypeScript: PASSES

## Part 4 ✅ — feat/url-context-classifier (PR #68)
- Added `UrlContext` type: homepage | api-endpoint | login-page | admin-page | health-endpoint
- Added `classifyUrl(url)`: path-based, generic, no hardcoded domains
- Applied routing: `checkAPISecurity()` → api-endpoint only
- 24 passing tests in `url-classifier.test.ts`
- TypeScript: PASSES
