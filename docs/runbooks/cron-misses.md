# Runbook: Cron Misses / Stale Scheduled Scans

## Trigger
- `/api/health` returns `degraded` with stale cron freshness.
- No recent `monitorRun` records despite active apps.

## Triage
1. Confirm `CRON_SECRET` is configured correctly in environment.
2. Verify Vercel cron configuration (`vercel.json`) and recent cron invocations.
3. Check endpoint auth failures (`401`) in logs for `/api/cron/run`.
4. Check for platform incidents affecting scheduled jobs.

## Mitigation / Fallback
- Manually trigger cron endpoint with valid bearer token.
- Trigger scans for highest criticality apps manually from UI/API.
- Reduce due-scan batch size if executions are timing out.

## Rollback
- If cron failures correlate with a recent release, roll back deployment.
- Re-run manual cron invocation to validate recovery.

## Escalation
- Escalate when stale period exceeds 12 hours.
- Escalate immediately if critical-app scans exceed SLA window.
