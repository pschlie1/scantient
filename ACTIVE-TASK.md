# ACTIVE-TASK.md — Tier 2 + Tier 3 + Deep Audit

## Status: IN PROGRESS — Deep Audit phase

## PRs Merged
| PR | Branch | Description |
|----|--------|-------------|
| #70 | feat/scantient-probe-endpoint | T2-A: Scantient probe endpoint |
| #71 | feat/probe-dashboard-ui | T2-C/D: Probe dashboard UI + app settings edit page |
| #72 | feat/connector-schema | T3 schema: ConnectorCredential + connectorResults |
| #73 | feat/connector-vercel | T3-A: Vercel connector |
| #74 | feat/connector-github | T3-B: GitHub connector |
| #75 | feat/connector-stripe | T3-C: Stripe connector |
| #76 | feat/connector-ui-integration | T3-D: Connector settings UI + scan integration |

## What was built
- T2-A: /api/internal/probe — Scantient's own reference probe endpoint
- T2-B: Already existed — probe wired into scanner-http.ts
- T2-C: SubsystemHealthCard in app detail page (/apps/[id])
- T2-D: App settings edit page (/apps/[id]/edit) with probeUrl/probeToken
- T3-schema: ConnectorCredential model + MonitorRun.connectorResults (migration deployed)
- T3-A: Vercel connector (deployment, domain, env, build trend checks)
- T3-B: GitHub connector (Dependabot, CI, stale PRs, branch protection)
- T3-C: Stripe connector (test mode, webhooks, signing secret, balance)
- T3-D: /api/connectors/[connector] API + /settings/connectors UI + InfrastructureHealthCard
- Also: SUBSYSTEM_UNHEALTHY findings now surfaced from T2 probe data
- Also: connector findings merged into main scan findings

## Deep Audit Status
- [ ] A. TypeScript + Build Health
- [ ] B. Test Suite
- [ ] C. Security Self-Scan
- [ ] D. API Endpoint Smoke Tests
- [ ] E. Probe Endpoint Test
- [ ] F. Findings Accuracy Review
- [ ] G. Write audit report
- [ ] H. Final deploy
