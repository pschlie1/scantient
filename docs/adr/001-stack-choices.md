# ADR-001: Stack Choices

**Date:** 2026-03-01  
**Status:** Accepted

## Context

Scantient is a production health and security monitoring SaaS for AI-generated apps.
We needed a full-stack framework that supports server-side rendering, API routes, and
rapid iteration with a small team.

## Decision

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 14 (App Router) | SSR + API routes in one repo; Vercel-native deployment |
| Language | TypeScript (strict) | Type safety across client and server; catch bugs at compile time |
| Database | PostgreSQL via Prisma ORM | Strong relational model for tenant/scan/finding data; type-safe queries |
| Auth | Custom session (iron-session / JWT) | No external auth dependency; full control over session shape and TTL |
| Rate limiting | Upstash Redis | Distributed limiting across serverless functions; in-memory fallback for dev |
| Email | Resend | Simple API; good deliverability; generous free tier |
| Payments | Stripe | Industry standard; webhooks for subscription lifecycle |
| Error tracking | Sentry | First-class Next.js integration; source map support |
| Deployment | Vercel | Zero-config Next.js hosting; preview environments per PR |

## Consequences

- **Positive:** Single-repo full-stack; fast deployment; strong TypeScript guarantees
- **Negative:** Vendor lock-in to Vercel for edge/cron features; Prisma migration workflow adds overhead
- **Mitigation:** All business logic in `src/lib/` is framework-agnostic and portable
