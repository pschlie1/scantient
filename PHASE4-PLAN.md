# PHASE 4: MONITORING, DEPLOYMENT & CONVERSION OPTIMIZATION - EXECUTION PLAN

**Date:** 2026-03-05 03:45 UTC  
**Status:** PLANNING → EXECUTION  
**Requester Context:** Main agent (Telegram)  

---

## Overview

Phase 4 will deploy Phase 3A/3B changes to production, establish error tracking, implement conversion funnel instrumentation, and baseline performance metrics.

---

## Current State (Pre-Phase 4)

### Repository
- **Branch:** main (ahead of origin by 5 commits)
- **Latest commit:** a550256 (Phase 3B: 297+ tests, 100% pass rate)
- **Node:** v22.22.0, Next.js 16.1.6, React 19.2.3
- **Build:** Verified in FINAL_DELIVERY_REPORT ✅

### Environment
- **Vercel Token:** Set ✅
- **Sentry SDK:** Installed (@sentry/nextjs) ✅
- **Sentry Configs:** Exist but incomplete (placeholder DSN/tokens)
- **App:** Ready to deploy (no known critical errors in main)

### Missing/To-Do
- Production DSN from Sentry (need to create/verify project)
- Analytics integration (Segment or custom events)
- Performance baselines (LCP, CLS, API latency)
- Deployment confirmation & screenshots

---

## PHASE 4 EXECUTION PLAN (5 Tasks)

### TASK 1: Deploy to Production ✅
**Objective:** Get Phase 3A/3B live on scantient.com  
**Time Estimate:** 15 minutes  
**Dependencies:** None  

**Steps:**
1. Verify build locally (`npm run build`)
2. Push 5 pending commits to origin/main (`git push`)
3. Deploy to Vercel (`npx vercel --prod --token=$VERCEL_TOKEN`)
4. Verify deployment:
   - Load scantient.com → Hero displays new copy ✓
   - Mobile view (375px) responsive ✓
   - Pricing shows 3 tiers (FREE/PRO/ENTERPRISE) ✓
   - No TypeScript or build errors in Vercel logs ✓
5. Screenshot production page (landing + mobile)
6. Document in DEPLOYMENT.md

**Success Criteria:**
- [ ] scantient.com loads without errors
- [ ] New hero copy visible
- [ ] Pricing tiers display correctly
- [ ] Mobile view responsive
- [ ] Vercel build log shows no errors

---

### TASK 2: Setup Sentry Error Tracking 🚨
**Objective:** Capture errors automatically in Sentry dashboard  
**Time Estimate:** 30 minutes  
**Dependencies:** Task 1 (deploy first, then verify Sentry)  

**Steps:**
1. Create Sentry project (or verify existing):
   - Org: dooder-digital
   - Project: scantient (or vibesafe if already exists)
   - Platform: Next.js
2. Obtain DSN from Sentry project settings
3. Update Vercel environment variables:
   - `NEXT_PUBLIC_SENTRY_DSN` → DSN from step 2
   - `NEXT_PUBLIC_SENTRY_ENVIRONMENT` → production
   - `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` → 0.1 (10% sampling to avoid noise)
   - `SENTRY_AUTH_TOKEN` → Sentry auth token
4. Redeploy to Vercel with new env vars
5. Test error capture:
   - Create a test error in dev (`throw new Error("Test error from Phase 4")`)
   - Verify it appears in Sentry dashboard within 2 minutes
6. Wire up error boundary (check if exists in `src/app/layout.tsx`)
   - Ensure ErrorBoundary wraps route components
   - Test: Throw error in component, verify boundary catches it
7. Document setup in DEPLOYMENT.md

**Success Criteria:**
- [ ] Sentry project created
- [ ] DSN obtained and set in Vercel env
- [ ] Redeployment successful
- [ ] Test error captured in Sentry dashboard
- [ ] Error boundary working

---

### TASK 3: Implement Conversion Funnel Tracking 📊
**Objective:** Track user journey from landing → signup → first scan → upgrade  
**Time Estimate:** 1.5 hours  
**Dependencies:** Task 1 (deploy first)  

**Approach:** Use browser `navigator.sendBeacon()` + simple in-app event logger  
(Segment overkill for MVP; we'll build custom analytics layer)

**Events to Track:**
```
Top of Funnel:
  - landing_page_viewed (auto on page load)
  - hero_cta_clicked (Start free scan)
  - pricing_cta_clicked (View pricing)

Middle of Funnel:
  - auth_started (Click signup/login)
  - auth_completed (Email verified)
  - app_added (First app connected)
  - free_scan_started (Initiate scan)
  - free_scan_completed (Scan finished)
  - findings_viewed (View results)

Bottom of Funnel:
  - upgrade_clicked (Pro/Enterprise CTA)
  - stripe_checkout_opened
  - payment_completed (Stripe webhook)
  - subscription_activated (Tier changed)

Attribution:
  - utm_source, utm_medium, utm_campaign (from URL)
  - referrer (document.referrer)
```

**Implementation Steps:**
1. Create `src/lib/events.ts` (event tracking client)
   - `trackEvent(name, properties)` → sends to analytics endpoint
   - Queues events in localStorage if offline
   - Batch sends on focus/periodic flush
2. Create `src/app/api/analytics/events/route.ts` (event ingestion endpoint)
   - POST /api/analytics/events
   - Validates event schema
   - Stores in DB table `AnalyticsEvent` (event_name, properties, user_id, session_id, timestamp)
   - No auth required (public events)
3. Add event tracking to key components:
   - Landing page (hero_cta_clicked, pricing_cta_clicked)
   - Signup form (auth_started, auth_completed)
   - Add app modal (app_added)
   - Scan UI (free_scan_started, free_scan_completed, findings_viewed)
   - Upgrade flow (upgrade_clicked, stripe_checkout_opened)
4. Add Stripe webhook event for payment completion
5. Create dashboard query in `src/app/api/analytics/funnel/route.ts`
   - Returns counts: total landed → clicked → signed up → paid
   - Calculates drop-off rates
   - Time in stage
6. Document all events in CONVERSION_TRACKING.md
   - Event name, properties, where fired, success definition

**Success Criteria:**
- [ ] Events tracking code written
- [ ] API endpoint receives events
- [ ] DB schema (AnalyticsEvent) created
- [ ] At least 3 events wired to UI (hero_cta_clicked, auth_started, free_scan_started)
- [ ] Test event fires and appears in dashboard
- [ ] CONVERSION_TRACKING.md documented

---

### TASK 4: Add Performance Monitoring 📈
**Objective:** Baseline Core Web Vitals and API latency  
**Time Estimate:** 1 hour  
**Dependencies:** Task 2 (Sentry) — will integrate with it  

**Steps:**
1. Add Web Vitals library: `npm install web-vitals`
2. Create `src/lib/performance.ts` to capture:
   - **LCP** (Largest Contentful Paint) — track in Sentry
   - **CLS** (Cumulative Layout Shift) — track in Sentry
   - **FCP** (First Contentful Paint) — track in Sentry
3. Wrap Sentry init to send vitals as breadcrumbs:
   ```ts
   onCLS(metric => Sentry.captureMessage(`CLS: ${metric.value}`))
   onLCP(metric => Sentry.captureMessage(`LCP: ${metric.value}`))
   ```
4. API latency tracking:
   - Add timing headers to API responses (`X-Response-Time`)
   - Log slow endpoints (>500ms) to Sentry
5. Create performance dashboard:
   - Query Sentry API for metrics over last 7 days
   - Store baseline in PERFORMANCE_DASHBOARD.md
   - Include: LCP median/p95, CLS average, error rate, API p95 latency
6. Sentry alerts:
   - LCP > 2.5s → warning
   - CLS > 0.1 → warning
   - Error rate > 1% → alert

**Success Criteria:**
- [ ] Web Vitals library integrated
- [ ] LCP/CLS/FCP captured in Sentry
- [ ] API response times logged
- [ ] Performance baseline documented
- [ ] Alerts configured

---

### TASK 5: Create Post-Deployment Report 📋
**Objective:** Document everything for future reference  
**Time Estimate:** 30 minutes  
**Dependencies:** All tasks above  

**Files to Create:**
1. **DEPLOYMENT.md**
   - Sentry setup guide (DSN, env vars, error boundary)
   - Deployment checklist
   - Rollback procedure

2. **CONVERSION_TRACKING.md**
   - Event catalog (name, properties, where fired)
   - Funnel definition (what = success at each stage)
   - Dashboard query examples
   - Drop-off analysis method

3. **PERFORMANCE_DASHBOARD.md**
   - Baseline metrics (LCP, CLS, API latency)
   - Alert thresholds
   - How to monitor in Sentry
   - Optimization roadmap

4. **PHASE4-DEPLOYMENT-REPORT.md**
   - Before/after screenshots
   - Deployment date/time/commit hash
   - Sentry verification checklist
   - Conversion events confirmed
   - Performance baseline metrics
   - Next optimization steps

---

## Git Commits (After Each Milestone)

```bash
# After Task 1: Deploy
git commit -m "deploy(phase4): Production deployment of Phase 3A/3B

- Landing page rewrite with new hero copy
- Mobile optimization (375px+)
- Simplified pricing (3 tiers)
- 297+ tests all passing"

# After Task 2: Sentry
git commit -m "feat(monitoring): Add Sentry error tracking

- Sentry project created (dooder-digital/scantient)
- Client/server/edge configs wired
- Error boundary integrated
- DSN in Vercel env"

# After Task 3: Analytics
git commit -m "feat(analytics): Implement conversion funnel tracking

- Event tracking client (events.ts)
- Analytics API endpoint
- DB schema (AnalyticsEvent)
- 8 events wired to UI
- Dashboard query for funnel metrics"

# After Task 4: Performance
git commit -m "feat(performance): Add Core Web Vitals & API latency monitoring

- Web Vitals library integrated
- LCP/CLS/FCP captured
- API response time logging
- Sentry alerts configured"

# After Task 5: Documentation
git commit -m "docs(phase4): Complete deployment documentation

- DEPLOYMENT.md (Sentry setup)
- CONVERSION_TRACKING.md (funnel events)
- PERFORMANCE_DASHBOARD.md (baseline metrics)
- PHASE4-DEPLOYMENT-REPORT.md (verification)"
```

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Vercel build fails | Build locally first, check logs, fix before deploying |
| Sentry DSN invalid | Verify project exists in UI, copy DSN exactly |
| Events don't fire | Check network tab in DevTools, verify endpoint exists |
| Performance regression | Compare LCP before/after, investigate if >500ms slower |
| Stripe webhook fails | Test webhook locally first, verify signature |

---

## Success Criteria (Final)

✅ Production deployment successful (scantient.com loads new landing page)  
✅ Sentry capturing errors (test by throwing error in dev)  
✅ Conversion funnel events firing (check API logs)  
✅ Performance baseline established (LCP, API latency, error rate documented)  
✅ All Phase 4 tasks documented in committed files  

---

## Timeline

| Task | Est. Time | Actual | Status |
|------|-----------|--------|--------|
| 1. Deploy | 15 min | — | ⏳ To Do |
| 2. Sentry | 30 min | — | ⏳ To Do |
| 3. Analytics | 1.5 hrs | — | ⏳ To Do |
| 4. Performance | 1 hr | — | ⏳ To Do |
| 5. Docs | 30 min | — | ⏳ To Do |
| **TOTAL** | **~4 hours** | — | — |

---

**PLAN COMPLETE. READY FOR EXECUTION.**
