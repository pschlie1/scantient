-- Add composite index on Finding(runId, status) to speed up verifyResolvedFindings
-- which queries: WHERE status = 'RESOLVED' AND run.appId = ?
-- The existing @@index([runId, severity]) doesn't help status-based filtering.
CREATE INDEX IF NOT EXISTS "Finding_runId_status_idx" ON "Finding"("runId", "status");
