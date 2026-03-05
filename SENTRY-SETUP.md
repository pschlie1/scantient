# Sentry Setup Guide for Scantient

**Date:** 2026-03-05 04:05 UTC  
**Status:** ⏳ Manual Project Creation Required  

---

## Overview

Sentry error tracking is installed (@sentry/nextjs v10.40.0) and configured, but the Sentry project needs to be created manually in the UI.

**Why?** The create-project API endpoint requires org-owner permissions that aren't available in the current token.

---

## Quick Setup (5 minutes)

### Step 1: Create Sentry Project ✅

1. Go to https://sentry.io/organizations/dooder-digital/projects/new/
2. Fill in:
   - **Project Name:** scantient
   - **Team:** Dooder Digital
   - **Platform:** JavaScript → Next.js
3. Click "Create Project"
4. You'll be shown the DSN (copy it for Step 2)

### Step 2: Get DSN and Keys

After creating the project:
1. Go to **Settings** → **Client Keys (DSN)**
2. Copy the **Public DSN** (format: `https://key@org.ingest.us.sentry.io/project-id`)
3. Go to **Settings** → **Auth Tokens**
4. Create a new token:
   - Name: "Vercel Deployment"
   - Scopes: `project:read`, `project:write`, `org:read`
   - Copy the token

### Step 3: Configure Vercel Environment

Add these variables to Vercel project settings:

**Dashboard → Settings → Environment Variables**

```bash
NEXT_PUBLIC_SENTRY_DSN=https://your-key@org.ingest.us.sentry.io/your-project-id
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_AUTH_TOKEN=sntrys_sentry_auth_token_here
SENTRY_ORGANIZATION=dooder-digital
SENTRY_PROJECT=scantient
```

### Step 4: Redeploy

```bash
cd /home/clawuser/.openclaw/workspace/scantient
npx vercel --prod --token=$VERCEL_TOKEN
```

Vercel will read the new env vars and Sentry will be fully configured.

### Step 5: Test Error Capture (2 minutes)

Create a test component:
```tsx
// src/app/test-sentry-error/page.tsx
export default function TestSentryError() {
  throw new Error("Phase 4: Testing Sentry integration from scantient.com");
}
```

Visit: `https://scantient.com/test-sentry-error`

Then check Sentry dashboard:
1. Go to https://sentry.io/organizations/dooder-digital/issues/
2. Filter by "scantient" project
3. You should see the test error within 2 minutes
4. Click on it to verify details (URL, browser, timestamp, stack trace)

---

## Sentry Configuration Details

### Files Already Configured ✅

**sentry.client.config.ts** (browser-side)
```ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
    /^Script error\.?$/,
  ],
});
```

**sentry.server.config.ts** (server-side)
- Configured for API routes and server components
- Captures database errors, API failures, auth issues

**sentry.edge.config.ts** (Vercel Edge Runtime)
- For middleware and edge functions
- Captures edge-specific errors

### Error Boundary Integration ⏳

Check if error boundary is in `src/app/layout.tsx`:

```tsx
import { SentryErrorBoundary } from '@sentry/nextjs';

export default function RootLayout({ children }) {
  return (
    <SentryErrorBoundary>
      {children}
    </SentryErrorBoundary>
  );
}
```

If not present, add it after Sentry project creation.

---

## Event Capture Examples

Once configured, Sentry captures:

### Browser Events
- **User Errors:** `throw new Error(...)`
- **Network Errors:** Failed API calls, timeouts
- **Missing Resources:** 404 images, CSS, scripts
- **React Errors:** Component lifecycle failures
- **Performance:** Slow page loads, interactions

### Server Events
- **API Errors:** 500 responses, timeouts
- **Database:** Connection failures, query errors
- **Auth:** Failed logins, token validation
- **External Services:** Stripe, Jira, GitHub API failures

### Performance Events (with 10% sampling)
- **Page Load Time:** LCP, CLS, FCP
- **API Latency:** Response times > 500ms
- **Database:** Query duration slow-log
- **Function Duration:** Serverless function execution time

---

## Sentry Alert Rules

After project creation, configure these alerts:

**Alert 1: New Error Type**
- Condition: A new issue is created
- Notify: #incidents Slack channel
- Action: Create GitHub issue (if critical)

**Alert 2: Error Rate Spike**
- Condition: Error rate > 1% of requests
- Notify: On-call engineer (PagerDuty)
- Action: Auto-rollback (if enabled)

**Alert 3: Performance Degradation**
- Condition: LCP > 2.5s (median)
- Notify: #performance Slack
- Action: Create perf ticket (for investigation)

---

## Monitoring Checklist

- [ ] Sentry project created (name: scantient)
- [ ] DSN copied to Vercel env (NEXT_PUBLIC_SENTRY_DSN)
- [ ] Auth token in Vercel (SENTRY_AUTH_TOKEN)
- [ ] Redeployed to production
- [ ] Test error thrown and captured
- [ ] Error appears in Sentry dashboard with full details
- [ ] Error boundary integrated (if needed)
- [ ] Alerts configured in Sentry
- [ ] Team invited to Sentry org

---

## Expected Errors (Normal)

These won't alarm you:
- `ResizeObserver loop limit exceeded` — Ignored (browser extension issue)
- `Network request failed` — From flaky connections
- `401 Unauthorized` — Expected auth failures
- `429 Too Many Requests` — Rate limit temporary spike
- TypeScript build warnings — Non-critical

## Critical Errors (Investigate)

These require immediate action:
- `500 Internal Server Error` — API crash
- `FATAL: Database connection failed` — Data access down
- `SyntaxError in component render` — Code deploy bug
- `Stripe webhook failed` — Revenue-blocking issue
- `LCP > 5000ms` — User experience severe

---

## Cleanup After Setup

Once verified:
1. Delete `/src/app/test-sentry-error/page.tsx` test page
2. Remove test error from codebase
3. Commit Sentry config changes

---

**Next Steps:**
1. Create Sentry project (manual in UI)
2. Get DSN + token
3. Update Vercel env vars
4. Redeploy
5. Test error capture
6. Proceed to Task 3 (Conversion Tracking)

---

*Estimated time: 5 minutes*  
*Prerequisites: Access to Sentry org (dooder-digital) as org owner or manager*
