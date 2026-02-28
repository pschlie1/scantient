#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_FILE="$BACKUP_DIR/vibesafe-${STAMP}.dump"

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file "$OUT_FILE"

echo "Backup created: $OUT_FILE"
