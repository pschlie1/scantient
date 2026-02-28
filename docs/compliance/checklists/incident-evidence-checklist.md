# Incident Evidence Checklist

Use this checklist to produce a privacy-safe incident package.

## Required evidence
- [ ] Incident window defined (`from` / `to`)
- [ ] Incident timeline exported (`/api/internal/incidents/export`)
- [ ] Critical/warning monitor runs included
- [ ] Notification delivery outcomes included
- [ ] Relevant audit events included

## Privacy checks
- [ ] No raw secrets, tokens, passwords, or key values
- [ ] No unnecessary user PII in exported package
- [ ] Evidence scoped to single org

## Closure evidence
- [ ] Root cause documented
- [ ] Remediation actions documented
- [ ] Follow-up hardening tasks created
- [ ] Customer/internal comms completion status recorded
