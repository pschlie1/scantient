# ACTIVE-TASK.md — Tier 2 + Tier 3 + Deep Audit

## Status: IN PROGRESS — Building Tier 2 and Tier 3 features

## What's already built
- probe-client.ts (T2-B complete)
- MonitorRun.probeResult + MonitoredApp.probeUrl/probeToken in schema
- scanner-http.ts has probe wired in (T2-B complete)
- PATCH /api/apps/[id] handles probeUrl/probeToken with encryption
- docs/probe-spec.md

## Work Plan

### Tier 2: Subsystem Health Probe
- [ ] T2-A: `src/app/api/internal/probe/route.ts` (branch: feat/scantient-probe-endpoint)
- [ ] T2-C: Probe results UI in app detail page (branch: feat/probe-dashboard-ui)
- [ ] T2-D: App settings edit page with probeUrl/probeToken (branch: feat/probe-settings-ui)

### Tier 3: Infrastructure Connectors
- [ ] Schema: ConnectorCredential + MonitorRun.connectorResults (branch: feat/connector-schema)
- [ ] T3-A: Vercel connector (branch: feat/connector-vercel)
- [ ] T3-B: GitHub connector (branch: feat/connector-github)
- [ ] T3-C: Stripe connector (branch: feat/connector-stripe)
- [ ] T3-D: Connector settings UI + scan integration (branch: feat/connector-ui-integration)

### Deep Audit
- [ ] TypeScript + build health
- [ ] Test suite
- [ ] Security self-scan
- [ ] API endpoint smoke tests
- [ ] Probe endpoint test
- [ ] Findings accuracy review
- [ ] Write audit report

## PRs Created
| PR | Branch | Description |
|----|--------|-------------|
| TBD | feat/scantient-probe-endpoint | Scantient's own probe endpoint |
| TBD | feat/probe-dashboard-ui | Probe results UI in app detail page |
| TBD | feat/probe-settings-ui | App settings UI for probe config |
| TBD | feat/connector-schema | DB schema: ConnectorCredential + connectorResults |
| TBD | feat/connector-vercel | Vercel infrastructure connector |
| TBD | feat/connector-github | GitHub infrastructure connector |
| TBD | feat/connector-stripe | Stripe infrastructure connector |
| TBD | feat/connector-ui-integration | Connector settings UI + scan integration |

## Checkpoints
(Updated after each PR merges)
