# CONVERSION_TRACKING.md - Funnel Events & Success Metrics

**Date:** 2026-03-05 04:15 UTC  
**Phase:** 4 (Monitoring, Deployment & Conversion Optimization)  

---

## Overview

Scantient tracks the entire user journey from landing page to paying customer using anonymous, sessionId-based event tracking.

**Key insight:** Events are grouped by `sessionId` to track the same user across multiple pageviews and interactions.

---

## 🎯 Funnel Definition

A successful conversion journey:
1. **Landing Page** → User arrives at scantient.com
2. **Engage** → Click "Start free scan" or "See pricing"
3. **Try Free** → Create account, add first app
4. **Run Scan** → Execute free scan, see results
5. **Upgrade** → Click upgrade, enter payment info
6. **Paid** → Stripe transaction succeeds

---

## 📊 Event Catalog

### TOP OF FUNNEL: Landing & Awareness

#### Event: `landing_page_viewed`
- **Fired:** Auto on page load (from `events.ts` client)
- **Properties:**
  - `path` (string): URL path, e.g., "/"
  - `referrer` (string): Previous page, e.g., "google.com"
- **Success Definition:** Baseline metric (everyone lands here)
- **Context:** No user ID (anonymous)

```ts
// Auto-tracked in EventsClient constructor
trackEvent('landing_page_viewed', {
  path: window.location.pathname,
  referrer: document.referrer,
});
```

---

#### Event: `hero_cta_clicked`
- **Fired:** User clicks "Start free scan" button (hero section)
- **Properties:**
  - `variant` (string): "primary" | "secondary" | "mobile"
  - `section` (string): e.g., "hero", "value-section"
  - `position` (number): DOM position if multiple CTAs
- **Success Definition:** >5% of landing users click this
- **Drop-off Alert:** If <3%, landing copy might not resonate

**Implementation:**
```tsx
// In src/app/page.tsx or hero component
import { trackEvent } from '@/lib/events';

<button
  onClick={() => {
    trackEvent('hero_cta_clicked', { variant: 'primary' });
    // navigate to signup or scan
  }}
>
  Start free scan
</button>
```

---

#### Event: `pricing_cta_clicked`
- **Fired:** User clicks "See pricing plans" or similar
- **Properties:**
  - `section` (string): "hero", "footer", "nav"
- **Success Definition:** ~2-3% of landing users
- **Context:** Usually users comparing plans before committing

```tsx
<button
  onClick={() => {
    trackEvent('pricing_cta_clicked', { section: 'hero' });
    window.location.hash = '#pricing';
  }}
>
  See pricing plans
</button>
```

---

### MIDDLE OF FUNNEL: Activation & Engagement

#### Event: `auth_started`
- **Fired:** User clicks "Sign up" or "Log in" button
- **Properties:**
  - `flow` (string): "signup" | "login"
  - `variant` (string): "email" | "google" | "github"
- **Success Definition:** >30% of CTA clickers reach auth
- **Drop-off Alert:** If <20%, friction in signup flow (UX issue)

```tsx
// In src/app/signup/page.tsx
<button
  onClick={() => {
    trackEvent('auth_started', { flow: 'signup', variant: 'email' });
  }}
>
  Sign up with email
</button>
```

---

#### Event: `auth_completed`
- **Fired:** User successfully logs in or verifies email
- **Properties:**
  - `flow` (string): "signup" | "login"
  - `method` (string): "email" | "oauth"
  - `time_to_verify` (number): seconds from auth_started
- **Success Definition:** >50% of auth_started reach this
- **Drop-off Alert:** If <40%, email verification might be blocking users

```tsx
// In src/app/api/auth/verify-email/route.ts
// After successful verification:
trackEvent('auth_completed', {
  flow: 'signup',
  method: 'email',
  time_to_verify: 300, // seconds
});
setAnalyticsUserId(user.id); // Now track as authenticated
```

---

#### Event: `first_app_added`
- **Fired:** User adds their first monitored app/domain
- **Properties:**
  - `app_type` (string): "web-app" | "next-js" | "react" | etc.
  - `domain` (string, hashed): SHA256 of domain for privacy
- **Success Definition:** >80% of signed-up users add an app
- **Drop-off Alert:** If <60%, onboarding flow is too complex

```tsx
// In src/app/apps/add/page.tsx
<button
  onClick={async () => {
    await addApp(appData);
    trackEvent('first_app_added', {
      app_type: appData.framework,
      domain: SHA256(appData.domain),
    });
  }}
>
  Add app
</button>
```

---

#### Event: `free_scan_started`
- **Fired:** User initiates a free security scan
- **Properties:**
  - `app_id` (string): which app they're scanning
  - `checks` (number): how many checks are running
- **Success Definition:** >70% of users with apps run a scan
- **Context:** This is where we show value (findings)

```tsx
// In scan UI
<button
  onClick={async () => {
    trackEvent('free_scan_started', {
      app_id: appId,
      checks: 12, // our default check count
    });
    await triggerScan();
  }}
>
  Run security scan
</button>
```

---

#### Event: `free_scan_completed`
- **Fired:** Scan finishes, results are displayed
- **Properties:**
  - `app_id` (string)
  - `duration_seconds` (number): how long scan took
  - `findings_count` (number): critical + high + medium + low
  - `critical_count` (number): just critical
- **Success Definition:** 100% of started scans should complete
- **Alert:** If <95%, scan engine reliability issue

```tsx
// In src/app/api/scan/[id]/route.ts
// After scan completes:
trackEvent('free_scan_completed', {
  app_id: scan.appId,
  duration_seconds: (Date.now() - startTime) / 1000,
  findings_count: results.findings.length,
  critical_count: results.findings.filter(f => f.severity === 'CRITICAL').length,
});
```

---

#### Event: `findings_viewed`
- **Fired:** User views the scan results/findings
- **Properties:**
  - `total_findings` (number)
  - `critical_findings` (number)
  - `avg_severity` (string): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
- **Success Definition:** >90% of completed scans are viewed
- **Context:** This is where we convert fear → action

---

### BOTTOM OF FUNNEL: Monetization

#### Event: `upgrade_clicked`
- **Fired:** User clicks "Upgrade to Pro" or "Enterprise" button
- **Properties:**
  - `current_tier` (string): "FREE" | "PRO" (before upgrade)
  - `target_tier` (string): "PRO" | "ENTERPRISE" (what they're upgrading to)
  - `from_section` (string): "findings" | "billing" | "nav"
- **Success Definition:** >10% of free users click upgrade
- **Drop-off Alert:** If <5%, pricing might not be compelling

```tsx
// In settings/billing or findings page
<button
  onClick={() => {
    trackEvent('upgrade_clicked', {
      current_tier: 'FREE',
      target_tier: 'PRO',
      from_section: 'findings',
    });
    navigateToCheckout();
  }}
>
  Upgrade to Pro
</button>
```

---

#### Event: `stripe_checkout_opened`
- **Fired:** User opens Stripe checkout modal/page
- **Properties:**
  - `target_tier` (string): "PRO" | "ENTERPRISE"
  - `variant` (string): "monthly" | "annual"
- **Success Definition:** >80% of upgrade clicks reach checkout
- **Drop-off Alert:** If <60%, checkout UX friction

```tsx
// In checkout component
<button
  onClick={async () => {
    trackEvent('stripe_checkout_opened', {
      target_tier: 'PRO',
      variant: 'monthly',
    });
    const session = await createCheckoutSession();
  }}
>
  Proceed to payment
</button>
```

---

#### Event: `payment_completed`
- **Fired:** Stripe webhook confirms successful payment
- **Properties:**
  - `tier` (string): "PRO" | "ENTERPRISE"
  - `amount_cents` (number): $399 = 39900
  - `billing_period` (string): "monthly" | "annual"
  - `time_to_pay` (number): seconds from auth_completed to payment
- **Success Definition:** 100% of checkouts → payment
- **CRITICAL:** This triggers subscription creation, should be highly reliable

```ts
// In src/app/api/stripe/webhook/route.ts
// On checkout.session.completed:
trackEvent('payment_completed', {
  tier: subscription.tier,
  amount_cents: session.amount_total,
  billing_period: subscription.billing_period,
  time_to_pay: calculateTimeFromSignup(user.id),
});
```

---

#### Event: `subscription_activated`
- **Fired:** Subscription status changes to ACTIVE (post-payment)
- **Properties:**
  - `tier` (string): "PRO" | "ENTERPRISE"
  - `trial_used` (boolean): true if they used free trial first
- **Success Definition:** 100% of payments should activate subscription

---

### SPECIAL: Technical & Debugging

#### Event: `page_error`
- **Fired:** Unhandled JavaScript error
- **Properties:**
  - `error_message` (string)
  - `stack_trace` (string)
  - `page` (string): current URL
- **Context:** Helps identify UX blockers

#### Event: `api_error`
- **Fired:** Failed API call (401, 500, timeout, etc.)
- **Properties:**
  - `endpoint` (string): "/api/scan", etc.
  - `status_code` (number): 500
  - `error_message` (string)
- **Context:** Identify infrastructure issues affecting users

---

## 📈 Funnel Metrics & Success Thresholds

| Stage | Event | Expected % of Previous | Alert Threshold |
|-------|-------|----------------------|-----------------|
| Landing | `landing_page_viewed` | 100% (baseline) | N/A |
| **Engage** | `hero_cta_clicked` | 5-10% | <2% = messaging issue |
| **Try** | `auth_started` | 50-70% of CTAs | <30% = funnel friction |
| **Register** | `auth_completed` | 60-80% of started | <40% = verification blocking |
| **Setup** | `first_app_added` | 85%+ of verified | <70% = onboarding friction |
| **Scan** | `free_scan_started` | 70-85% of apps | <50% = needs CTA |
| **Results** | `free_scan_completed` | 95%+ of started | <90% = engine reliability |
| **Monetize** | `upgrade_clicked` | 5-15% of free users | <2% = pricing/copy issue |
| **Checkout** | `stripe_checkout_opened` | 70-85% of clicks | <50% = checkout UX friction |
| **Pay** | `payment_completed` | 80%+ of opened | <60% = payment failure issue |

---

## 🔍 Drop-off Analysis

**Method: Compare consecutive stages**

```ts
// Example: Identify biggest funnel leaks

const funnel = {
  landing: 1000,        // 100%
  engagement: 75,       // 7.5% → DROP 92.5%
  auth: 50,             // 67% of engaged → DROP 33%
  signup: 40,           // 80% of auth → DROP 20%
  app_added: 32,        // 80% of signed → DROP 20%
  scan_started: 24,     // 75% of apps → DROP 25%
  scan_completed: 22,   // 92% of started → OK
  upgrade_clicked: 2,   // 9% of free → DROP 91%
  paid: 1,              // 50% of upgrade → DROP 50%
};

// Issues:
// 1. CRITICAL: Only 7.5% engage (need better landing copy)
// 2. HIGH: Only 9% of free users upgrade (pricing/value prop unclear)
// 3. HIGH: 50% abandon at checkout (payment UX issue)
```

---

## 📊 Queries & Dashboard

### Get recent funnel metrics
```bash
curl https://scantient.com/api/analytics/funnel?days=7
```

Response:
```json
{
  "period": { "days": 7, "since": "2026-02-26", "until": "2026-03-05" },
  "keyMetrics": {
    "totalLanded": 1000,
    "totalSignups": 40,
    "totalPaid": 1,
    "signupRate": 4.0,
    "paidRate": 2.5,
    "lifetime": {
      "landingPageToSignup": "4%",
      "signupToPaid": "2%",
      "landingPageToPaid": "0.1%"
    }
  },
  "funnel": [
    { "name": "Landing Page View", "event": "landing_page_viewed", "count": 1000, "conversionRate": 100 },
    { "name": "Hero CTA Click", "event": "hero_cta_clicked", "count": 75, "conversionRate": 7.5 },
    ...
  ]
}
```

### Get all events (for debugging)
```bash
curl https://scantient.com/api/analytics/events?limit=100
```

---

## 🧪 Testing Events Locally

**1. Enable event tracking in dev:**

```tsx
// In browser console
import { trackEvent } from '@/lib/events';
trackEvent('test_event', { custom: 'data' });
```

**2. Check localStorage:**
```ts
localStorage.getItem('scantient_session_id');
// "1709611532123-abcdef123"
```

**3. Monitor network:**
- Open DevTools → Network tab
- Trigger an event
- Look for POST to `/api/analytics/events`
- Should see 202 Accepted response

**4. Query database:**
```bash
SELECT name, count(*) FROM AnalyticsEvent 
WHERE createdAt > now() - interval '1 hour'
GROUP BY name;
```

---

## 🚀 Integration Checklist

Before going live:

- [ ] Event tracking client working (events.ts)
- [ ] API endpoint receiving events (/api/analytics/events)
- [ ] Database migration applied (AnalyticsEvent table)
- [ ] At least 3 events wired to UI components
- [ ] Test event fires and appears in database
- [ ] Funnel dashboard accessible (/api/analytics/funnel)
- [ ] Funnel metrics make sense (not all zeros)
- [ ] Team can access analytics dashboard
- [ ] Alerts set for critical drop-offs

---

## 📈 Week 1 Success Criteria

After deploying Phase 4:

- ✅ 100+ unique sessions in first week
- ✅ Landing page data shows referrer sources
- ✅ Can identify top drop-off stage
- ✅ Can calculate signup rate and paid rate
- ✅ No missing events in critical funnel stages

---

**CONVERSION_TRACKING.md Created: 2026-03-05 04:15 UTC**  
**Status: Event tracking infrastructure ready for instrumentation**
