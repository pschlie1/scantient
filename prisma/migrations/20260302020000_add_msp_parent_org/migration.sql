-- Migration: add MSP multi-tenancy support
-- Adds parentOrgId to Organization for MSP→Client relationships

-- AddColumn
ALTER TABLE "Organization" ADD COLUMN "parentOrgId" TEXT;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentOrgId_fkey"
  FOREIGN KEY ("parentOrgId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Organization_parentOrgId_idx" ON "Organization"("parentOrgId");
