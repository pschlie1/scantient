# ADR-004: Queue and Async Job Strategy

**Date:** 2026-03-02  
**Status:** Accepted

## Context

Scantient performs HTTP security scans, PDF report generation, email delivery, and webhook firing — all of which are I/O-bound and potentially slow. Running these synchronously in API route handlers would cause request timeouts on Vercel's 10s edge limit and degrade UX.

## Decision

### Current Approach: Vercel Cron + In-Process Async

| Job Type | Mechanism | Notes |
|----------|-----------|-------|
| Scheduled HTTP scans | Vercel Cron → `POST /api/cron/run` | Fires every 5 min; claims apps atomically before scanning |
| Alert delivery | Fire-and-forget in `scanner-http.ts` | `sendCriticalFindingsAlert().catch()` — non-blocking |
| Email (Resend) | Awaited inline in route handler | Acceptable; Resend p99 < 500ms |
| Webhook delivery | Fire-and-forget in `alerts.ts` | HMAC-signed; non-blocking |
| PDF generation | Awaited inline in `/api/reports/pdf` | Acceptable for < 5s generation |
| Weekly digest | Vercel Cron → `POST /api/reports/weekly` | Nightly batch |

### Why No BullMQ / Redis Queue?

- Current job volume doesn't justify the operational overhead of a persistent queue
- Vercel Cron provides reliable scheduling without a worker process
- Upstash Redis is already in the stack for rate limiting — could be extended to a queue if needed
- Atomic `updateMany` claim step prevents duplicate scan processing

### Future Trigger: Adopt BullMQ When

- Scan volume exceeds ~1,000 apps/hour (cron loop won't finish before next invocation)
- PDF generation exceeds Vercel's 10s timeout regularly
- Webhook delivery needs retry guarantees with dead-letter queue

## Consequences

- **Positive:** Zero additional infrastructure; simple mental model; easy to debug
- **Negative:** No retry on failure (scan fails → no retry until next cron); alert delivery is best-effort
- **Mitigation:** `MonitorRun` captures `error` field on failure; alerts have 1-hour cooldown preventing storm; cron TOCTOU protected by atomic claim
