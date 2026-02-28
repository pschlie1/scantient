-- CreateTable
CREATE TABLE "public"."IntegrationConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SSOConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "tenantId" TEXT,
    "domain" TEXT NOT NULL,
    "discoveryUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SSOConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationConfig_orgId_idx" ON "public"."IntegrationConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_orgId_type_key" ON "public"."IntegrationConfig"("orgId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SSOConfig_orgId_key" ON "public"."SSOConfig"("orgId");

-- AddForeignKey
ALTER TABLE "public"."IntegrationConfig" ADD CONSTRAINT "IntegrationConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SSOConfig" ADD CONSTRAINT "SSOConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
