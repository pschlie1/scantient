# ACTIVE-TASK.md — Tier 2 + Tier 3 + Deep Audit

## Status: COMPLETE

## PRs Merged (in order)
| PR | Branch | Description |
|----|--------|-------------|
| #70 | feat/scantient-probe-endpoint | T2-A: Scantient probe endpoint (/api/internal/probe) |
| #71 | feat/probe-dashboard-ui | T2-C/D: Probe dashboard UI + App settings edit page |
| #72 | feat/connector-schema | T3 schema: ConnectorCredential model + connectorResults |
| #73 | feat/connector-vercel | T3-A: Vercel connector |
| #74 | feat/connector-github | T3-B: GitHub connector |
| #75 | feat/connector-stripe | T3-C: Stripe connector |
| #76 | feat/connector-ui-integration | T3-D: Connector settings UI + scan integration |
| #77 | fix/test-mocks-after-tier2-tier3 | Fix 905 tests (checkInlineScriptCount + vi.mock nesting) |
| #78 | fix/middleware-probe-route | Fix: add /api/internal/ to middleware bypass |

## Deep Audit Results
- TypeScript: 0 errors ✅
- Build: success ✅
- Tests: 905/905 passing ✅
- Security scan scantient.com: 96/A ✅
- Deployed to production: dpl_Lqu6hXtVvcUc87tR5YD3RQFW7QhC ✅

## Known Issues (pre-existing, not caused by this session)
- All production API routes return HTTP 500 at scantient.com
  - Existed before this session (confirmed by checking old deployment ID S4BugJETAj0SlnS9ruomN)
  - Likely: Neon DB cold start or prisma.config.ts loading .env file that doesn't exist in Vercel
  - Recommended fix: switch to @neondatabase/serverless Prisma adapter

## Audit Report
/home/clawuser/.openclaw/workspace/memory/scantient-audit-2026-03-02.md
