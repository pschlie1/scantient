-- Migration: add discoveredEndpointCount to MonitorRun
-- Stores the number of auth/API endpoints discovered by the Tier 1 auth surface scanner

-- AlterTable
ALTER TABLE "MonitorRun" ADD COLUMN "discoveredEndpointCount" INTEGER;
