# Runbook: Scan Failures

## Trigger
- Spike in failed monitor runs.
- `/api/scan/:id` returning 5xx.
- Customer reports stale/failed scan status.

## Triage
1. Check `/api/health` for overall status and cron freshness.
2. Inspect recent `monitorRun` rows for error patterns (timeouts, DNS, TLS, 4xx/5xx).
3. Review Sentry issues tagged `route:/api/scan/[id]` or `route:/api/cron/run`.
4. Verify target URLs are reachable externally.

## Mitigation / Fallback
- Retry failed scans for critical apps only.
- Temporarily reduce scan concurrency/batch size if systemic timeout pressure is detected.
- For persistent target-side failures, mark as external dependency and notify app owner.

## Rollback
- If a recent deploy introduced failures, roll back to prior stable deployment in Vercel.
- Confirm failure rate recovery after rollback.

## Escalation
- Escalate to on-call engineer if failure rate >20% for 30 min.
- Escalate to product/security lead if critical-app scanning is impaired >2 hours.
