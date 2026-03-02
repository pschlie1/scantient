-- Migration: add appId + updatedAt to Finding, add appId_code unique constraint
-- Audit-22 Focus 1: scanner finding deduplication via upsert on (appId, code)
--
-- appId is nullable to preserve existing finding rows (which can be back-filled
-- via their run → app relation). New findings created by the scanner will always
-- have appId set; the unique constraint prevents duplicate findings per app+code.

-- Add appId column (nullable to support zero-downtime migration of existing data)
ALTER TABLE "Finding" ADD COLUMN "appId" TEXT;

-- Add updatedAt column with a sensible default (existing rows set to createdAt time)
ALTER TABLE "Finding" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Back-fill appId for existing findings using the run → app join
UPDATE "Finding"
SET "appId" = (
  SELECT "MonitorRun"."appId"
  FROM "MonitorRun"
  WHERE "MonitorRun"."id" = "Finding"."runId"
);

-- Add foreign key from Finding.appId → MonitoredApp.id (nullable, cascade on delete)
ALTER TABLE "Finding"
  ADD CONSTRAINT "Finding_appId_fkey"
  FOREIGN KEY ("appId")
  REFERENCES "MonitoredApp"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- Add unique constraint on (appId, code) — enforces deduplication for non-NULL appId.
-- PostgreSQL treats NULLs as distinct in unique indexes, so legacy rows with
-- appId IS NULL will not trigger duplicate violations.
CREATE UNIQUE INDEX "Finding_appId_code_key" ON "Finding"("appId", "code");

-- Add index on (appId, status) for efficient per-app finding queries
CREATE INDEX "Finding_appId_status_idx" ON "Finding"("appId", "status");
