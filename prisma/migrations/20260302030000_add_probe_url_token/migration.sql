-- Migration: add probe endpoint fields to MonitoredApp
-- Adds optional probeUrl and probeToken for secret probe endpoint support

-- AlterTable
ALTER TABLE "MonitoredApp" ADD COLUMN "probeUrl" TEXT;
ALTER TABLE "MonitoredApp" ADD COLUMN "probeToken" TEXT;
