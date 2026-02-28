#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <backup-file> <target-database-url>" >&2
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DB_URL="$2"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "Restoring $BACKUP_FILE into target database..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$TARGET_DB_URL" "$BACKUP_FILE"

echo "Running restore verification checks..."
psql "$TARGET_DB_URL" -c "SELECT now() AS restore_verified_at;"
psql "$TARGET_DB_URL" -c "SELECT COUNT(*) AS monitored_apps FROM \"MonitoredApp\";"
psql "$TARGET_DB_URL" -c "SELECT COUNT(*) AS monitor_runs FROM \"MonitorRun\";"

echo "Restore verification completed successfully."
