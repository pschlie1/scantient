# ADR-005: Observability Strategy

**Date:** 2026-03-02  
**Status:** Accepted

## Context

Scantient needs visibility into errors, performance, and business metrics across serverless Next.js functions deployed on Vercel.

## Decision

### Error Tracking: Sentry

- **SDK:** `@sentry/nextjs` v10 with `withSentryConfig` in `next.config.ts`
- **Coverage:** Server, client, and edge runtimes (all three init files present)
- **Captures:** Unhandled exceptions + explicit `captureException()` in all route catch blocks via `logApiError()` in `src/lib/observability.ts`
- **Source maps:** Uploaded automatically via `withSentryConfig`
- **Error boundary:** `src/app/error.tsx` calls `Sentry.captureException` client-side

### Structured Logging: Console + Vercel Log Drain

- All route errors logged via `logApiError(err, { route, ...context })` — never raw `console.error`
- No secrets or PII logged (enforced by code review + audit checks)
- Request IDs included in log context for correlation
- Vercel Log Drain can forward to Datadog/Logtail if needed

### Performance: Vercel Analytics

- Web Vitals (LCP, FID, CLS) tracked via `@vercel/analytics`
- API route duration visible in Vercel dashboard per function

### Business Metrics: AuditLog Table

- All sensitive user actions written to `AuditLog` (login, logout, invite, role change, SSO config, API key, billing)
- Queryable for compliance reports and anomaly detection

### Alerting

- Sentry alerts on error rate spike (configured in Sentry project settings)
- FounderOps NOC agent monitors uptime via ping every 5 minutes

## What We Deliberately Omit

- **OpenTelemetry / Jaeger:** Not justified at current scale; Sentry + Vercel dashboards sufficient
- **Custom metrics pipeline:** Overkill for MVP; revisit at $10K MRR
- **Log aggregation service:** Vercel log drain to Logtail deferred until log volume warrants cost

## Consequences

- **Positive:** Zero additional infra; Sentry free tier covers current volume; Vercel analytics built-in
- **Negative:** No distributed tracing across services; limited custom dashboard capability
- **Mitigation:** Structured `logApiError` context makes Sentry search effective; AuditLog covers compliance needs
