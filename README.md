# VibeSafe

Production health + security monitoring for AI-generated apps. External scans, no SDK required.

## The Problem

Employees at mid-market companies ship AI-built internal tools and customer-facing apps in hours using Cursor, Lovable, and Replit. IT leaders are accountable for those apps but have zero visibility into whether they're healthy or secure.

**VibeSafe solves this** with continuous external monitoring that requires no SDK integration in the monitored apps.

## What This Ships (Customer Value)

- **Register apps in seconds** — just the URL, owner email, and criticality level
- **External scans (no SDK)** for:
  - Exposed API keys in client-side JavaScript (54% prevalence)
  - Missing security headers (72% prevalence)
  - Client-side auth bypass patterns (41% prevalence)
- **Actionable findings** with plain-language explanations and AI fix prompts
- **Portfolio dashboard** for IT governance visibility
- **Scheduled checks every 4 hours** via Vercel Cron
- **Weekly governance reports** for compliance documentation

## Quick Start

```bash
# Clone and install
git clone https://github.com/pschlie1/vibesafe.git
cd vibesafe
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Initialize database
npm run db:migrate

# Run locally
npm run dev
```

Open http://localhost:3000

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite file path or Postgres connection string |
| `CRON_SECRET` | Yes | Bearer token for cron endpoints |
| `RESEND_API_KEY` | No | Resend.com API key for email alerts |
| `ALERT_FROM_EMAIL` | No | From address for alert emails |
| `SENTRY_DSN` | No | Sentry DSN for API/server error capture |
| `SENTRY_ENVIRONMENT` | No | Environment tag (e.g. production, staging) |
| `HEALTH_CRON_STALE_MINUTES` | No | Threshold for stale cron freshness in `/api/health` |

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/apps` | GET | — | List all monitored apps |
| `/api/apps` | POST | — | Register new app |
| `/api/scan/:id` | POST | — | Run immediate scan |
| `/api/cron/run` | GET | Bearer | Run all due scans (cron) |
| `/api/dashboard` | GET | — | Portfolio summary + recent runs |
| `/api/reports/weekly` | GET | Bearer | Weekly governance report |
| `/api/health` | GET | — | Service health check |

## CI/CD

GitHub Actions workflow in `.github/workflows/ci.yml`:
- Lint (ESLint)
- Typecheck (TypeScript strict)
- Tests (Vitest with coverage)
- Production build

Local full verification:
```bash
npm run ci
```

## Reliability & Operations Docs

- SLOs and alert thresholds: `docs/slo-and-alerts.md`
- Incident runbooks: `docs/runbooks/`
- Backup and restore drill: `docs/backup-restore.md`

## Production Deployment (Vercel)

1. Connect repo to Vercel
2. Set environment variables:
   - `DATABASE_URL` (use Vercel Postgres or Supabase)
   - `CRON_SECRET` (random secret for cron auth)
   - `RESEND_API_KEY` (optional, for email alerts)
3. Cron schedules from `vercel.json` auto-register:
   - Scans: every 4 hours
   - Weekly report: Mondays at 12:00 UTC

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript strict)
- **Database:** Prisma + SQLite (dev) → Postgres (prod)
- **Scanning:** HTTP-based (serverless compatible)
- **Scheduling:** Vercel Cron
- **Testing:** Vitest
- **CI/CD:** GitHub Actions

## Architecture Decisions

### HTTP-based scanning (not Playwright by default)
- Works in serverless/container environments without system deps
- Faster execution, lower resource usage
- Playwright scanner available for local/advanced use

### SQLite initial → Postgres migration path
- Fast local development
- Change `DATABASE_URL` to Postgres connection string for production
- Run `npm run db:migrate` to apply schema

### External monitoring (no SDK)
- Zero instrumentation required in monitored apps
- Works with any web app regardless of framework
- Reduces enterprise sales friction

## Manifesto Alignment

- **Outcome over activity:** Every scan returns status + business risk + fix action
- **Agent-first workflow:** scan → detect → explain → remediate prompt
- **API-first surface:** All operations available via REST
- **Data moat from day one:** Every run/finding persisted for trend analysis

## License

MIT
