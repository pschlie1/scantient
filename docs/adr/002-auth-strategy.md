# ADR-002: Authentication and Session Strategy

**Date:** 2026-03-01  
**Status:** Accepted

## Context

Scantient needs to authenticate human users (dashboard) and machine callers (API v1, CI scan, agent).
We evaluated NextAuth, Clerk, and a custom session approach.

## Decision

### Human Auth (Dashboard)
- **Email + password** with bcrypt hashing (cost factor 12)
- **JWT-based sessions** stored in an HttpOnly, Secure, SameSite=Strict cookie
- **Session TTL:** 24 hours with sliding refresh on activity
- **SSO:** OIDC-compatible via configurable provider (per-org); callback validates `id_token`
- **Invite flow:** Signed token (HMAC-SHA256) with 72-hour expiry; single-use

### Machine Auth (API)
- **API keys** (prefix `sk_`, 32-byte random, stored as SHA-256 hash) for v1 API callers
- **Bearer token** (CRON_SECRET env var) for internal cron endpoints
- **Agent key** (per-app, prefix `agt_`) for the scan agent webhook

### Password Security
- Brute-force protection: 5 failed attempts → 15-minute lockout per email
- Password reset via HMAC-signed email link (1-hour TTL, single-use)
- Minimum 8 characters enforced at API layer

## Consequences

- **Positive:** No external auth service dependency; full control; works in any deployment
- **Negative:** We own the security surface — must stay current with best practices
- **Mitigation:** Rate limiting, brute-force guards, and audit logging for all auth events (added audit-10)
