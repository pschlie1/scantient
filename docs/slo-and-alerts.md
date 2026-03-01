# Scantient SLOs and Alert Thresholds (Wave 1)

## Scope
Initial production SLOs for API availability, scan freshness, and notification reliability.

## SLOs

### 1) API Availability SLO
- **Target:** 99.5% successful responses for core API endpoints (`/api/apps`, `/api/dashboard`, `/api/scan/:id`) over 30 days.
- **Error budget:** 0.5% failed requests.
- **Measurement:** request success rate from platform logs + Sentry error volume.

### 2) Scheduled Scan Freshness SLO
- **Target:** 99% of monitored apps have a successful scan within the last 6 hours.
- **Measurement:** latest `monitorRun.startedAt` and status trends.
- **Health tie-in:** `/api/health` returns `degraded` when cron freshness is older than `HEALTH_CRON_STALE_MINUTES` (default 360).

### 3) Alert Delivery SLO
- **Target:** 99% of alert email sends succeed over 30 days.
- **Measurement:** success/failure rate in email provider logs + `/api/alerts/test` outcomes.

## Initial Alert Thresholds

### High urgency (page)
- API 5xx error rate > 5% for 10 minutes.
- `/api/health` status = `unhealthy` for 5+ consecutive checks.
- No successful cron scan activity for > 12 hours.

### Medium urgency (ticket + Slack/email)
- `/api/health` status = `degraded` for > 30 minutes.
- Alert delivery failures > 2% in rolling 1 hour.
- Security scan failure rate > 20% in rolling 1 hour.

## Operational Notes
- Keep Sentry traces sampling low initially (`SENTRY_TRACES_SAMPLE_RATE=0` or small value) to control cost.
- Revisit thresholds after two weeks of production baseline data.
