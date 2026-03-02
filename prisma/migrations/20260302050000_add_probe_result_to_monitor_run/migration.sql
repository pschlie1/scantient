-- Migration: add probeResult (Json?) to MonitorRun
-- This field stores the Tier 2 subsystem health probe data from the target app's
-- /api/scantient-probe endpoint. Null when no probeUrl is configured or probe was skipped.

ALTER TABLE "MonitorRun" ADD COLUMN "probeResult" JSONB;
