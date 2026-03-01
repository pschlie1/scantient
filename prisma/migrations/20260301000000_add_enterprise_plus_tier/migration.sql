-- Add ENTERPRISE_PLUS value to SubscriptionTier enum
-- Safe operation: ALTER TYPE ADD VALUE does not require table rebuild in PostgreSQL
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'ENTERPRISE_PLUS';

-- Add EXPIRED value to SubscriptionTier enum (also missing)
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'EXPIRED';
