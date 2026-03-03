-- AddColumn: authHeaders to MonitoredApp
-- This column was defined in schema.prisma but the migration was never generated.
ALTER TABLE "MonitoredApp" ADD COLUMN IF NOT EXISTS "authHeaders" TEXT;
