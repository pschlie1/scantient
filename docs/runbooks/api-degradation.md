# Runbook: API Degradation

## Trigger
- Elevated latency or 5xx error rate.
- `/api/health` status `degraded` or `unhealthy`.

## Triage
1. Check `/api/health` response for DB latency and cron freshness.
2. Review Sentry issue spikes by route and deployment version.
3. Inspect database connectivity and slow query indicators.
4. Correlate with latest deployment and traffic changes.

## Mitigation / Fallback
- Roll back recent deployment if strongly correlated.
- Temporarily disable non-critical heavy endpoints/jobs.
- Rate-limit or queue expensive operations under load.

## Rollback
- Revert to last known good deployment and verify health endpoint recovers.

## Escalation
- Page on-call for >5% 5xx over 10 minutes.
- Escalate to infrastructure provider support for persistent DB/network incidents.
