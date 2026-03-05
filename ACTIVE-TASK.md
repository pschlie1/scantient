# ACTIVE-TASK: Scantient Product Transformation

## Status: PHASE 1 COMPLETE ✅
**Completed:** 2026-03-05 02:30 UTC

---

## Objective
Make Scantient a million-dollar-looking SaaS with clear value per tier, robust tests, and professional UX.

## Phase 1: Value Proposition Audit ✅ DONE

### What Was Done
1. **Explored codebase**
   - Mapped 5 tier structure: FREE (Builder), STARTER, PRO, ENTERPRISE, ENTERPRISE_PLUS
   - Identified tier capabilities in `src/lib/tier-capabilities.ts`
   - Examined Stripe configuration and pricing in `src/lib/stripe.ts`

2. **Mapped current tiers and features**
   - **Builder (FREE):** 1 app, 1 user, daily scans, core checks only
   - **Starter ($199):** 5 apps, 2 users, 8-hour scans, governance report (unused tier)
   - **Pro ($399):** 15 apps, 10 users, 4-hour scans, API access, Jira/GitHub/Teams integrations
   - **Enterprise ($1500):** 100 apps, 50 users, 1-hour scans, SSO, PagerDuty, audit logs
   - **Enterprise Plus ($2500):** Unlimited apps (999), all features, priority support

3. **Walked through UI/UX as each persona**
   - Landing page: Clean feature cards (12 shown, 20 claimed)
   - Signup flow: Frictionless (email → verify → dashboard)
   - Results display: Clear security grade, plain-English findings
   - Dashboard: Portfolio view with status badges (Healthy/Warning/Critical)
   - Billing page: Simple plan comparison, manage billing modal
   - Mobile: Responsive, layout holds up

4. **Identified critical gaps and rough edges**
   - **4 CRITICAL BUGS blocking revenue:**
     1. ENTERPRISE_PLUS stored as ENTERPRISE in DB (customers paying $2500/mo get $1500 service)
     2. ENTERPRISE_PLUS scan interval defaults to 24h instead of 1h
     3. Jira integration completely broken (double-protocol URL)
     4. CI Scan API bypasses app count limits
   - **5 HIGH-PRIORITY issues** (tier gates, retry logic, middleware)
   - **4 MEDIUM-PRIORITY issues** (copy violations, undercooked Starter tier)

5. **Documented findings in PRODUCT-ROADMAP.md**
   - Current state analysis with tier matrix
   - Value prop per tier (what hooks customers?)
   - Critical bugs with impact + fix time estimates
   - UI/UX audit results (what's good, what needs work)
   - Competitive positioning (who we beat, why)
   - Feature gaps by tier
   - Quick wins (2.5 hours total effort)
   - Medium-term improvements (1-2 weeks each)

---

## Key Findings

### Biggest Gap
**ENTERPRISE_PLUS tier is broken.** Customers paying $2,500/month are silently stored as ENTERPRISE tier, receiving 100-app limits instead of 999, and 24-hour scan intervals instead of 1-hour. This is contractual fraud and blocks scaling beyond 1-2 enterprise deals.

### Revenue Impact
- **HIGH-RISK:** All critical bugs (CB1-4) directly affect paying customers
- **MEDIUM-RISK:** Pricing page is confusing (5 tiers), conversion rate likely low
- **LOW-RISK:** UI/UX is clean but copy needs work

### Recommendation for Phase 2
**Ship quick wins first (2.5 hours):**
1. Fix Jira integration (CB-3)
2. Fix ENTERPRISE_PLUS tier gate (CB-1 + CB-2)
3. Fix CI Scan API limit bypass (CB-4)
4. Fix trends endpoint tier gate (HP-1)
5. Fix Jira test endpoint tier gate (HP-5)

Then measure trial-to-paid conversion baseline, then ship medium-term wins.

---

## Phase 2: Build & Ship (NEXT) 🚀

### Quick Wins (2.5 hours, ship as single PR)
1. **QW-1: Fix Jira integration (CB-3)** — 20 min
   - Remove `https://` prefix in URL construction
   - Test: `src/app/api/integrations/jira/ticket/route.ts`
   - File: `src/app/api/integrations/jira/test/route.ts`

2. **QW-2: Fix ENTERPRISE_PLUS tier gate (CB-1 + CB-2)** — 1.5 hours
   - Add ENTERPRISE_PLUS to Prisma SubscriptionTier enum
   - Update scan interval maps in `src/lib/scanner-http.ts` and `src/app/api/agent/scan/route.ts`
   - Migrate existing ENTERPRISE_PLUS rows if any
   - Test: Create ENTERPRISE_PLUS org, verify 1-hour scan interval

3. **QW-3: Fix CI Scan API limit bypass (CB-4)** — 30 min
   - Add `canAddApp(orgId)` check in `src/app/api/public/ci-scan/route.ts`
   - Return 403 with upgrade prompt if at limit
   - Test: Try to add 6th app as BUILDER user, verify rejection

4. **QW-4: Fix trends endpoint tier gate (HP-1)** — 20 min
   - Add `getOrgLimits()` check to `src/app/api/metrics/trends/route.ts`
   - Only allow PRO, ENTERPRISE, ENTERPRISE_PLUS
   - Test: Try as FREE user, verify 403

5. **QW-5: Fix Jira test endpoint tier gate (HP-5)** — 10 min
   - Copy tier gate from main Jira CRUD endpoint
   - Add to `src/app/api/integrations/jira/test/route.ts`

**Ship as:** Single PR `fix: critical billing and tier-gate bugs (CB1-4, HP1, HP5)`

### Medium-Term (1-2 weeks, ship after baseline)
1. **MT-1: Simplify pricing page** (4 hours)
   - Remove STARTER from landing page
   - Show only FREE, PRO, ENTERPRISE
   - Move ENTERPRISE_PLUS to "Custom" CTA

2. **MT-2: Add remediation guides to findings** (2 days)
   - Database of fix templates for each finding type
   - Display on finding detail page

3. **MT-3: Add snooze/ignore to findings** (1 day)
   - Schema: `suppressed` boolean on Finding
   - UI: Suppress button on finding detail

4. **MT-4: Rewrite landing copy** (1 day)
   - Remove jargon ("dangerouslySetInnerHTML", "CSP")
   - Add examples ("Your Stripe key is visible in JavaScript")

5. **MT-5: Retry logic for critical alerts** (1.5 days)
   - Add exponential backoff for CRITICAL alerts to Teams, PagerDuty, GitHub

6. **MT-6: Add tooltips to dashboard** (4 hours)
   - Lucide icons + Tooltip component
   - Explain MTTA, Finding Velocity, Security Score

---

## Success Criteria

### Phase 2 Completion
- [ ] All 5 quick wins merged and tested
- [ ] ENTERPRISE_PLUS fully functional (storage + scan interval + features)
- [ ] Jira integration tested end-to-end
- [ ] CI Scan API respects tier limits
- [ ] Trends endpoint gated to PRO+
- [ ] No errors in Sentry after deploy
- [ ] Trial-to-paid baseline measured

### Expected Timeline
- **Quick wins:** Thu-Fri (2026-03-06/07) — 2.5 hours
- **Medium-term:** Mon-Fri (2026-03-10/14) — ~2 weeks
- **Go-live:** By end of week (2026-03-14)

---

## Documentation
- **Detailed roadmap:** `/home/clawuser/.openclaw/workspace/scantient/PRODUCT-ROADMAP.md`
- **Previous audit:** `AUDIT-REPORT-2026-03-01.md`
- **Tier capabilities:** `src/lib/tier-capabilities.ts`
- **Stripe config:** `src/lib/stripe.ts`

---

## Notes
- STARTER tier is confusing and unused — consider removing after fixing quick wins
- Landing page claims "20 checks" but shows only 12 (not in critical bugs, but worth fixing)
- Marketing copy has em-dash violations (fixable in 2 hours)
- Design tokens are well-enforced — no visual inconsistencies
- Design is Apple-like simplicity; no major redesign needed

---

**Phase 1 audit ready for handoff to Phase 2 development.**
