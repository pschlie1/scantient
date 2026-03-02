-- Migration: add ConnectorCredential table + connectorResults to MonitorRun
-- Tier 3: Infrastructure connectors (Vercel, GitHub, Stripe)

-- Add connectorResults column to MonitorRun
-- Stores raw ConnectorResult JSON keyed by connector name
ALTER TABLE "MonitorRun" ADD COLUMN "connectorResults" JSONB;

-- Create ConnectorCredential table
-- Stores AES-256-GCM encrypted credentials for infrastructure connectors
-- One row per org per connector (unique constraint enforces this)
CREATE TABLE "ConnectorCredential" (
  "id"        TEXT        NOT NULL,
  "orgId"     TEXT        NOT NULL,
  "connector" TEXT        NOT NULL,
  "encrypted" TEXT        NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConnectorCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConnectorCredential_orgId_connector_key" UNIQUE ("orgId", "connector"),
  CONSTRAINT "ConnectorCredential_orgId_fkey"
    FOREIGN KEY ("orgId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Index for fast org-based lookups
CREATE INDEX "ConnectorCredential_orgId_idx" ON "ConnectorCredential"("orgId");
