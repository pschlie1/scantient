# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scantient is a security monitoring platform for AI-generated applications. It performs external scans (no SDK required) to detect exposed API keys, missing security headers, and client-side auth bypass patterns in web apps built with Cursor, Lovable, Replit, etc.

## Commands

```bash
# Development
npm run dev                    # Start Next.js dev server on :3000
npm run build                  # Build for production (includes prisma generate)

# Quality checks
npm run lint                   # ESLint (includes design system rules)
npm run typecheck              # TypeScript strict mode check
npm run test                   # Vitest with coverage
npm run ci                     # Full CI: lint + typecheck + test:ci + build

# Run single test file
npx vitest src/lib/security.test.ts

# Database
npm run db:migrate             # Apply Prisma migrations
npm run db:generate            # Regenerate Prisma client after schema changes
```

## Architecture

### Multi-Tenant Model
- `Organization` is the tenant boundary — all data queries are scoped by organization
- MSP support: organizations can manage client organizations via parent/client relationships
- RBAC roles: Owner > Admin > Member > Viewer

### Scanning Architecture
Three-tier external scanning (all serverless-compatible):
- **scanner-http.ts**: Primary HTTP-based scanner for static analysis, API key detection, security headers
- **scanner-browser.ts**: Playwright-based scanner for JS-heavy SPAs
- **scanner-auth.ts**: Detects client-side auth bypass patterns

Finding management in `src/lib/`:
- `scanner-finding-dedup.ts`: Prevents duplicate vulnerability reports across scans
- `remediation-lifecycle.ts`: Finding states (OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED/IGNORED)
- `remediation-guides.ts`: AI-powered fix prompts per finding type

### Security Enforcement
- **Middleware** (`src/middleware.ts`): JWT validation, CSP with per-request nonces, security headers
- **Rate limiting** (`src/lib/rate-limit.ts`): Distributed Upstash Redis + local fallback, fail-closed on auth endpoints
- **SSRF guard** (`src/lib/ssrf-guard.ts`): Prevents scanning internal IPs/hostnames
- **Input validation**: Zod schemas on all API routes

### API Structure
- `/api/v1/*`: Versioned public API (API key auth)
- `/api/cron/*`: Scheduled jobs (Bearer token auth via `CRON_SECRET`)
- `/api/auth/*`: Authentication endpoints (public)
- Dashboard APIs: Session-authenticated

## Design System

**Dark-first "Slate" theme** with semantic Tailwind classes. All colors defined in `globals.css` @theme block.

```tsx
// Use semantic Tailwind classes (defined in globals.css @theme)
<div className="bg-surface text-heading border-border">
<div className="bg-page text-muted">
<FormInput name="email" label="Email" />  // from @/components/ui/

// ✅ Correct: semantic classes
<div className="bg-surface text-heading border border-border rounded-lg">
<span className="text-muted">Subtitle</span>

// ❌ Will fail lint: default Tailwind palette
<div className="bg-gray-50 text-gray-900">  // Use bg-surface, text-heading
<div className="bg-white border-gray-200">  // Use bg-surface, border-border
<input type="email" />                       // Use <FormInput> from @/components/ui/
```

Key semantic classes: `bg-page`, `bg-surface`, `bg-surface-raised`, `text-heading`, `text-body`, `text-muted`, `border-border`, `border-border-subtle`, `bg-primary`, `bg-primary-hover`, `text-error`, `text-success`, `text-warning`, `text-info`

Key files:
- `src/app/globals.css`: @theme palette + semantic token definitions
- `src/lib/chart-colors.ts`: Hex constants for recharts/canvas contexts
- `src/components/ui/`: Button, Card, Badge, FormInput, FormTextarea, FormSelect, Container
- `eslint-rules/`: Custom rules (color-token, spacing-token, form-wrapper)

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/security.ts` | Main security checking logic (~67KB) |
| `src/lib/scanner-http.ts` | HTTP-based vulnerability scanner |
| `src/lib/tier-capabilities.ts` | Subscription tier feature gates |
| `src/middleware.ts` | Auth, CSP, security headers |
| `prisma/schema.prisma` | Database schema (16 migrations) |

## Testing

58 test files with 1,400+ tests. Key test suites:
- `scanner-http.test.ts`: HTTP scanning accuracy
- `security-audit-*.test.ts`: Security finding detection
- `rate-limit.test.ts`: Distributed rate limiting + fallback modes
- `remediation-lifecycle.test.ts`: Finding state management
- `findings-logic.test.ts`: Deduplication logic

## Environment Variables

Required:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Session signing key
- `ENCRYPTION_KEY`: AES-256-GCM for sensitive config
- `CRON_SECRET`: Bearer token for cron endpoints

Production recommended:
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`: Distributed rate limiting
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`: Billing
- `RESEND_API_KEY`: Email alerts
- `SENTRY_DSN`: Error tracking
