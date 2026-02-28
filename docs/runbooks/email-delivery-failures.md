# Runbook: Email Delivery Failures

## Trigger
- Alert send errors from API or provider dashboard.
- Delivery success rate drops below 99% SLO.

## Triage
1. Verify `RESEND_API_KEY` and `ALERT_FROM_EMAIL` are present and valid.
2. Check provider status page and account-level suppression/bounce metrics.
3. Review Sentry/logs for `/api/alerts` and `/api/alerts/test` errors.
4. Validate recipient address formatting and domain sender verification.

## Mitigation / Fallback
- Use `/api/alerts/test` to validate a known-safe recipient.
- Temporarily switch to alternate verified sender if current sender blocked.
- For urgent incidents, send fallback notifications through secondary channel (Slack/manual).

## Rollback
- Roll back recent email-template or alert pipeline changes if correlated.

## Escalation
- Escalate to on-call if failures persist >30 minutes.
- Escalate to provider support if account-level throttling/suppression suspected.
