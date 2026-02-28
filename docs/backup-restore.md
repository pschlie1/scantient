# Database Backup & Restore Verification (Wave 1)

## Safety Notes
- Never run restore against production first.
- Perform restore drills in an isolated staging database.
- Keep backup artifacts in secure storage with retention policy.

## Prerequisites
- `pg_dump`, `pg_restore`, and `psql` installed.
- `DATABASE_URL` set for the source database.

## Backup Procedure
```bash
chmod +x scripts/db-backup.sh scripts/db-restore-verify.sh
DATABASE_URL="postgresql://..." ./scripts/db-backup.sh
```

Output: `./backups/vibesafe-<timestamp>.dump`

## Restore Verification Procedure
```bash
./scripts/db-restore-verify.sh ./backups/vibesafe-<timestamp>.dump "postgresql://staging-user:pass@host:5432/vibesafe_restore_test"
```

The script:
1. Restores backup into target DB.
2. Executes basic verification queries.
3. Exits non-zero on failure.

## Restore Drill Checklist (Operator Runnable)
- [ ] Confirm target database is non-production.
- [ ] Capture timestamp and operator name.
- [ ] Run backup script and verify backup file exists.
- [ ] Run restore verification script against staging DB.
- [ ] Confirm verification query outputs are non-empty/expected.
- [ ] Run app health check against environment connected to restored DB.
- [ ] Document drill result and issues in incident log.
