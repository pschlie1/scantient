# DEPLOYMENT.md - Production Deployment & Monitoring Setup

**Date:** 2026-03-05 03:58 UTC  
**Phase:** 4 (Monitoring, Deployment & Conversion Optimization)  

---

## 🚀 Production Deployment

### Deployment Details
- **Date:** 2026-03-05 03:57 UTC
- **Commit:** a550256 (test: 297+ tests, 100% pass rate)
- **Deployed By:** Phase 4 Subagent
- **URL:** https://scantient.com ✅
- **Region:** Vercel (SFO origin, iad1 build region)
- **Build Status:** ✅ SUCCESSFUL (47 seconds)
- **TypeScript:** ✅ No errors
- **Tests:** ✅ 1,423 passing

### Verification
- HTTP Status: 200 ✅
- Hero page: Loads (verified via curl)
- Build log: No errors, no warnings
- Next.js version: 16.1.6
- React version: 19.2.3

### Previous Deployment
- **URL:** https://scantient-gmodtvx2y-peter-schliesmanns-projects.vercel.app (preview)
- **Production Alias:** Aliased to https://scantient.com ✅

---

## 🚨 Sentry Error Tracking Setup

### Status: ⏳ IN PROGRESS

#### Project Information
- **Organization:** dooder-digital
- **Project Name:** scantient (to be created/verified)
- **Platform:** Next.js (via @sentry/nextjs SDK)

#### Installation & Configuration

**Step 1: SDK Installation** ✅
```bash
npm install @sentry/nextjs
# Already installed (v10.40.0)
```

**Step 2: Configuration Files** ✅
- `sentry.client.config.ts` — Browser-side error tracking
- `sentry.server.config.ts` — Backend error tracking
- `sentry.edge.config.ts` — Edge runtime errors

**Step 3: Create Sentry Project** ⏳
- Go to https://sentry.io
- Org: dooder-digital
- Create project: "scantient"
- Platform: Next.js
- Obtain DSN (format: `https://key@sentry.io/project-id`)

**Step 4: Set Environment Variables in Vercel** ⏳
Add to Vercel project environment variables:
```bash
NEXT_PUBLIC_SENTRY_DSN=https://key@sentry.io/project-id
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% sampling
SENTRY_AUTH_TOKEN=<auth-token-from-sentry>
SENTRY_ORGANIZATION=dooder-digital
SENTRY_PROJECT=scantient
```

**Step 5: Error Boundary Integration** ⏳
Check `src/app/layout.tsx` for ErrorBoundary wrapper:
```tsx
import { Sentry } from '@sentry/nextjs';

export default function RootLayout({ children }) {
  return (
    <Sentry.ErrorBoundary>
      {children}
    </Sentry.ErrorBoundary>
  );
}
```

**Step 6: Verification** ⏳
After redeployment:
1. Create test error in dev:
   ```tsx
   // In any component
   throw new Error("Test error from Phase 4 - Sentry verification");
   ```
2. Check Sentry dashboard for error (2-minute lag typical)
3. Verify error appears with:
   - Timestamp ✓
   - URL path ✓
   - Stack trace ✓
   - User context (if authenticated) ✓

### Error Types Captured
- **Browser Errors:** JS exceptions, network failures, user interactions
- **Server Errors:** API failures, database errors, auth issues
- **Performance Issues:** Slow transactions, Web Vitals degradation
- **Security Issues:** Rate limit violations, auth failures

### Sentry Alerts (To Configure)
```json
{
  "Alert Conditions": {
    "New Issue": "Any new error type",
    "Error Rate": ">1% of requests fail",
    "Performance": "LCP >2.5s or CLS >0.1",
    "Release": "Errors increase >10% after deploy"
  }
}
```

---

## 🔍 Error Boundary Testing

**Location:** `src/app/layout.tsx` or per-route error boundary

**Test Procedure:**
1. Create component with intentional error:
   ```tsx
   // src/app/test-error.tsx
   export default function TestError() {
     throw new Error("Phase 4: Sentry test error");
   }
   ```
2. Deploy to Vercel
3. Visit `/test-error` in production
4. Verify in Sentry dashboard within 2 minutes
5. Error should show:
   - URL: scantient.com/test-error
   - Message: "Phase 4: Sentry test error"
   - Browser: Chrome/Firefox/Safari (user's UA)
   - Stack trace with source maps

---

## 📊 Monitoring Checklist

Before considering Phase 4 complete:

- [ ] Sentry project created and verified
- [ ] DSN added to Vercel environment
- [ ] Redeployment successful
- [ ] Test error thrown and captured in Sentry
- [ ] Error boundary integrated (if needed)
- [ ] Alerts configured
- [ ] Team invited to Sentry org
- [ ] 24/7 on-call rotation established

---

## 🔄 Rollback Procedure

If critical errors appear in production:

**Option 1: Immediate Rollback (5 min)**
```bash
# Revert to previous stable commit
git revert a550256  # Current deployment
git push origin main
npx vercel --prod --token=$VERCEL_TOKEN
```

**Option 2: Older Deployment (if needed)**
- Visit Vercel dashboard
- Click "Deployments"
- Select previous stable build
- Click "Promote to Production"

**Communication:**
- Post to #incidents Slack channel
- Page on-call engineer
- Update status page

---

## 🚨 Incident Response

**If Sentry shows errors >1%:**
1. **Assess:** Check error type, affected pages, user impact
2. **Isolate:** Is it new (since last deploy) or pre-existing?
3. **Decide:** Fix forward or rollback?
   - **Fix Forward:** If low-impact, merge fix and redeploy
   - **Rollback:** If high-impact, use procedure above
4. **Communicate:** Notify team in Slack
5. **Postmortem:** Review after 24h

---

## 📝 Next Steps

### Immediate (Phase 4)
1. ✅ Production deployment complete
2. ⏳ Sentry project setup (Task 2)
3. ⏳ Conversion tracking (Task 3)
4. ⏳ Performance monitoring (Task 4)
5. ⏳ Documentation completion (Task 5)

### Short-term (Week of 2026-03-10)
- Monitor error rate in Sentry
- Analyze conversion funnel data
- Baseline performance metrics
- Adjust alerts based on initial data

### Medium-term (2026-03-17+)
- Optimize pages with lowest LCP
- Investigate drop-off stages in funnel
- Implement retries for failed critical alerts
- Build dashboards in Vercel Analytics

---

## 🔗 Resources

- **Sentry Docs:** https://docs.sentry.io/platforms/javascript/guides/nextjs/
- **Vercel Docs:** https://vercel.com/docs/integrations/sentry
- **Next.js Error Handling:** https://nextjs.org/docs/app/building-your-application/routing/error-handling

---

**DEPLOYMENT.md Created: 2026-03-05 03:58 UTC**  
**Status: Production Live ✅ | Sentry Setup: ⏳ In Progress**
