# Runbook: Incident Response

**Owner:** Engineering on-call  
**Last updated:** 2026-03-01

---

## Severity Levels

| Level | Description | Response SLA |
|-------|-------------|--------------|
| P0 | Total outage / data breach | Immediate (24/7) |
| P1 | Major feature broken, >20% users impacted | 30 min |
| P2 | Degraded performance, partial feature loss | 2 hours |
| P3 | Minor bug, cosmetic issue | Next business day |

---

## P0/P1 Incident Process

### 1. Detect
- Alert fires in PagerDuty / Slack `#incidents`
- Or customer report escalated by support

### 2. Declare
- Post in `#incidents`: "**INCIDENT P[0/1]**: [short description] — [your name] incident commander"
- Create incident in PagerDuty if not auto-created

### 3. Triage (first 10 min)
```bash
# Check service health
curl https://scantient.com/api/health

# Check Vercel deployment status
vercel logs --project scantient --follow

# Check recent deploys
git log --oneline -10

# Check Sentry for new errors
# → https://sentry.io/organizations/dooder-digital/issues/?project=scantient
```

### 4. Contain
- If bad deploy: **rollback immediately** → see `deploy-rollback.md`
- If data issue: **pause writes** → set `MAINTENANCE_MODE=true` in Vercel env
- If DB issue: → see `database-restore.md`

### 5. Communicate
- Update Slack every 15 min: "Update: [status], [action taken], ETA [time]"
- For P0: notify stakeholders within 30 min

### 6. Resolve
- Confirm fix is live and metrics are recovering
- Post all-clear in `#incidents`

### 7. Post-mortem (within 48h)
- Timeline of events
- Root cause
- 3 action items with owners

---

## Useful Links
- Vercel dashboard: https://vercel.com/peter-schliesmanns-projects/scantient
- Sentry: https://sentry.io/organizations/dooder-digital/issues/
- PagerDuty: https://scantient.pagerduty.com
- DB (Supabase): https://supabase.com/dashboard
