# Runbook: Database Restore

**Owner:** Engineering on-call  
**Last updated:** 2026-03-01

> ⚠️ **Critical:** Never run `prisma db push` on production. It destroys data.  
> Always use `prisma migrate deploy` for schema changes.

---

## When to Use This Runbook

- Accidental data deletion (DROP TABLE, mass delete)
- Corrupted migration that truncated data
- DB restore needed as part of incident response

---

## Pre-Restore Checklist

- [ ] Confirm this is actually a data-loss event (not just a bug)
- [ ] **Stop all writes** → set `MAINTENANCE_MODE=true` in Vercel environment vars
- [ ] Notify stakeholders: "DB restore in progress, service in maintenance mode"
- [ ] Identify the target restore point (timestamp of last known-good state)

---

## Restore from Supabase Point-in-Time Recovery (PITR)

Scantient uses Supabase for managed PostgreSQL. PITR is available on Pro plan+.

1. Go to https://supabase.com/dashboard → Project → Settings → Database
2. Click **"Restore database"** (PITR tab)
3. Enter the target timestamp (UTC)
4. Confirm — Supabase will restore to a new instance
5. Update `DATABASE_URL` in Vercel environment to point to restored instance
6. Run `npx prisma migrate deploy` to ensure schema is current
7. Verify data integrity with spot queries

---

## Restore from Manual Backup

If automated backup is available (e.g., from `backups/` directory):

```bash
# Stop writes first
# Set MAINTENANCE_MODE=true in Vercel

# Restore from pg_dump backup
pg_restore -h <host> -U <user> -d scantient_prod -v backup-YYYY-MM-DD.dump

# Or for plain SQL dump
psql $DATABASE_URL < backup-YYYY-MM-DD.sql

# Apply any migrations that postdate the backup
npx prisma migrate deploy
```

---

## Post-Restore Checklist

- [ ] Spot-check critical tables: `User`, `Organization`, `Subscription`, `MonitoredApp`
- [ ] Verify row counts match expectations
- [ ] Run `npx prisma migrate status` — all migrations should be applied
- [ ] Re-enable writes: set `MAINTENANCE_MODE=false`
- [ ] Smoke test: login, list apps, trigger scan
- [ ] Document the incident and data loss window in post-mortem

---

## Backup Policy

- Supabase daily automated backups retained 7 days (Pro plan)
- Before any schema migration: run `pg_dump $DATABASE_URL > backups/pre-migration-$(date +%Y%m%d).dump`
