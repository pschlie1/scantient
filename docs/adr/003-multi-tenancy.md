# ADR-003: Multi-Tenancy and Data Isolation

**Date:** 2026-03-01  
**Status:** Accepted

## Context

Scantient serves multiple organizations. Each org's apps, scans, findings, and users
must be strictly isolated — a user in Org A must never see or affect Org B's data.

## Decision

### Tenant Model
- Every user belongs to exactly one `Organization` (org)
- The `orgId` is the tenancy boundary — all tenant-scoped tables have a non-nullable `orgId` column
- The authenticated session carries `userId` and `orgId`; all queries scope by `orgId`

### Isolation Enforcement
- **Route layer:** Every authenticated route calls `getSession()` and passes `session.orgId` to service functions
- **Service layer:** All DB queries include `where: { orgId: session.orgId }` — never trust a user-supplied orgId
- **Audit layer:** All sensitive mutations log `orgId` + `userId` to the `AuditLog` table

### Tables with Tenant Scope
`MonitoredApp`, `MonitorRun`, `Finding`, `Alert`, `ApiKey`, `TeamMember`, `SsoConfig`,
`Integration.*`, `Report.*`, `AuditLog`

### Tables WITHOUT Tenant Scope (global/shared)
`User` (scoped by orgId FK), `Organization`, `StripeWebhookEvent`

### Testing
- Every new tenant-scoped endpoint requires a cross-tenant isolation test:
  create two orgs, authenticate as org A, attempt to access org B's resource — expect 403 or 404

## Consequences

- **Positive:** Simple model; enforced at application layer; easy to audit
- **Negative:** No database-level RLS (Postgres row-level security) — relies on application correctness
- **Mitigation:** Comprehensive cross-tenant test suite (`tenant-isolation*.test.ts`); code review required for any new DB query
