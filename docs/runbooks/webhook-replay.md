# Runbook: Webhook Replay

**Owner:** Engineering on-call  
**Last updated:** 2026-03-01

---

## When to Use This Runbook

- Stripe webhook events were missed (e.g., endpoint was down during a payment event)
- Customer's subscription shows wrong tier after payment
- `checkout.session.completed` was not processed
- Webhook processing errors in Sentry

---

## 1. Diagnose

### Check Stripe webhook logs
1. Go to https://dashboard.stripe.com/webhooks
2. Select the Scantient endpoint
3. Review failed/undelivered events
4. Identify the event ID(s) to replay (e.g., `evt_1Xx...`)

### Check Sentry for processing errors
- Search Sentry for errors in `/api/stripe/webhook`
- Look for signature verification failures or DB errors

---

## 2. Replay Stripe Events

### Via Stripe Dashboard (easiest)
1. Go to https://dashboard.stripe.com/webhooks → your endpoint
2. Find the failed event → click **"Resend"**
3. Verify the subscription updated in DB:
   ```sql
   SELECT tier, status, "updatedAt" 
   FROM "Subscription" 
   WHERE "orgId" = '<orgId>';
   ```

### Via Stripe CLI
```bash
# Install Stripe CLI if not present
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Replay a specific event
stripe events resend evt_1XxYYZZ123456

# Test with local forwarding (dev only)
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## 3. Manual Fix (Last Resort)

If Stripe replay is not possible, manually update the subscription:

```bash
# Connect to DB
psql $DATABASE_URL

# Update subscription tier (replace values as needed)
UPDATE "Subscription" 
SET 
  tier = 'PRO',
  status = 'ACTIVE',
  "stripeSubscriptionId" = 'sub_1Xxx...',
  "maxApps" = 10,
  "maxUsers" = 5,
  "updatedAt" = NOW()
WHERE "orgId" = 'org_xxx';

# Verify
SELECT * FROM "Subscription" WHERE "orgId" = 'org_xxx';
```

---

## 4. Internal Webhook Replay (Alert Channels)

If a Scantient alert notification failed to deliver:

1. Check `AlertConfig` table for the affected org
2. Use the `/api/alerts/test` endpoint to send a test notification:
   ```bash
   curl -X POST https://scantient.com/api/alerts/test \
     -H "Cookie: session=..." \
     -H "Content-Type: application/json" \
     -d '{"configId": "<alertConfigId>"}'
   ```
3. Or manually trigger a scan to regenerate alert notifications

---

## Post-Replay Checklist

- [ ] Subscription tier matches what customer paid for
- [ ] Customer can access tier-gated features
- [ ] No duplicate events processed (Stripe webhook handler uses `upsert` — safe)
- [ ] Add note to incident timeline if replay was part of incident response
