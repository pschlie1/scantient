# Runbook: Deploy Rollback

**Owner:** Engineering on-call  
**Last updated:** 2026-03-01

---

## When to Rollback

- New deploy caused P0/P1 incident
- Error rate spikes >5% in Sentry after deploy
- Key API endpoints returning 5xx after deploy
- Rollback is **always safe** — prefer it over hot-patching in production

---

## Rollback via Vercel (Preferred — ~2 min)

1. Go to https://vercel.com/peter-schliesmanns-projects/scantient/deployments
2. Find the last **good** deployment (before the bad one)
3. Click **⋯ (More)** → **Promote to Production**
4. Confirm promotion
5. Verify with `curl https://scantient.com/api/health`

---

## Rollback via Git + CLI

```bash
# Find the last good commit
git log --oneline -20

# Create a revert commit
git revert HEAD --no-edit

# Push and deploy
git push origin main

# Or force-deploy a specific commit
git checkout <good-commit-sha>
npx vercel --prod --token=$VERCEL_TOKEN --scope=peter-schliesmanns-projects
```

---

## Rollback with Database Migrations

If the bad deploy included a schema migration:

1. **Stop all writes first** (set `MAINTENANCE_MODE=true` in Vercel env vars)
2. Rollback the code (steps above)
3. If schema rollback is needed → see `database-restore.md`
4. Re-enable writes (`MAINTENANCE_MODE=false`)

> ⚠️ **Never run `prisma db push` in production** — use `prisma migrate deploy` only.

---

## Post-Rollback Checklist

- [ ] Health endpoint returns 200
- [ ] Sentry error rate returning to baseline
- [ ] Spot-check key user flows (login, add app, scan)
- [ ] Notify team in `#deployments`
- [ ] Create post-mortem if P0/P1
