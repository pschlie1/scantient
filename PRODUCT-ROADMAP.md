# Scantient Product Roadmap — Phase 1 Audit Complete

## Audit Date: 2026-03-05

---

## Current State Analysis

### What Scantient Is
External security monitoring SaaS for AI-generated web apps. No SDK required — just register the URL and Scantient runs continuous HTTP-based scans to detect:
- Exposed API keys in client-side JavaScript
- Missing security headers
- Client-side auth bypass patterns
- Inline script risks
- Config/meta leaks
- Third-party script risks
- Form security issues
- Broken links
- Performance regression
- Exposed endpoints
- Dependency version risks

**Target Market:** IT leaders responsible for internal tools and customer-facing apps built with Cursor, Lovable, Replit, etc.

---

## Tier Analysis (Current)

| Tier | Price | Apps | Users | Key Features | Status |
|------|-------|------|-------|--------------|--------|
| **Builder (FREE)** | Free | 1 | 1 | Core 20 checks, daily scans, email alerts | ✅ Active |
| **Starter** | $199/mo | 5 | 2 | 8-hour scans, governance report | 🟡 Unused (no real customers) |
| **Pro** | $399/mo | 15 | 10 | 4-hour scans, API access, PDF reports, Slack/webhook alerts, Jira/GitHub/Teams integrations | ✅ Active |
| **Enterprise** | $1,500/mo | 100 | 50 | 1-hour scans, SSO, PagerDuty, full audit logs, executive reports | ✅ Active |
| **Enterprise Plus** | $2,500/mo | 999 | 999 | Unlimited, same features as Enterprise | 🔴 Broken (stored as ENTERPRISE) |

### Value Prop Per Tier

**Builder (Free):**
- **Hook:** "See if your AI-built app is leaking secrets"
- **Use Case:** Solo founders, internal tools, proof of concept
- **Limitation:** Single app, daily scans (24h lag means you discover breaches a day late)
- **Why Upgrade:** Need faster feedback on multiple apps as you grow

**Starter ($199):**
- **Hook:** "Monitor a small portfolio with governance reporting"
- **Use Case:** Small IT teams
- **Limitation:** Rarely chosen — gap between FREE and PRO is too big. Teams jump straight to PRO.
- **Gap:** No API access, no integrations (Jira/GitHub/Teams). Feels unfinished.

**Pro ($399):**
- **Hook:** "Full visibility into your app portfolio + integration with your existing tools"
- **Use Case:** Mid-market IT teams with 5-15 apps, need workflow integration
- **Why It Sells:** Jira integration + API access = can run scans in CI/CD pipeline, auto-create tickets for findings
- **Reality:** This is the sweet spot. Most paying customers are here.

**Enterprise ($1,500):**
- **Hook:** "Compliance-ready monitoring with team controls"
- **Use Case:** Large orgs needing SOC 2, ISO 27001, NIST CSF evidence
- **Why It Sells:** SSO, PagerDuty integration, audit logs, executive board reports
- **Reality:** Works but has **critical bugs** (see below).

**Enterprise Plus ($2,500):**
- **Hook:** "Unlimited apps, priority support"
- **Use Case:** Enterprises at scale
- **Reality:** 🔴 **BROKEN** — customers paying $2,500/month are silently stored as ENTERPRISE tier, getting 100-app limits instead of 999. Scan intervals still default to 24h instead of 1h. This is contractual fraud.

---

## Critical Bugs Found (MUST FIX BEFORE GROWTH)

### 🔴 CB-1: ENTERPRISE_PLUS stored as ENTERPRISE in database
**Impact:** Customers paying $2,500/month receive FREE tier features.  
**File:** `src/app/api/stripe/webhook/route.ts`  
**Fix:** 1 hour. Add ENTERPRISE_PLUS to Prisma enum.  
**Revenue Impact:** HIGH — blocks any ENTERPRISE_PLUS sales.

### 🔴 CB-2: ENTERPRISE_PLUS scan interval defaults to 24 hours
**Impact:** ENTERPRISE_PLUS customers get 24h scan intervals instead of 1h.  
**Files:** `src/lib/scanner-http.ts`, `src/app/api/agent/scan/route.ts`  
**Fix:** 10 minutes. Add `ENTERPRISE_PLUS: 1` to two maps.  
**Revenue Impact:** HIGH — immediate customer complaint after purchase.

### 🔴 CB-3: Jira integration completely broken (double-protocol URL)
**Impact:** Zero Jira tickets can be created. Enterprise feature that doesn't work.  
**Files:** `src/app/api/integrations/jira/test/route.ts`, `src/app/api/integrations/jira/ticket/route.ts`  
**Fix:** 15 minutes. Remove prepended `https://` in URL construction.  
**Revenue Impact:** CRITICAL — first demo breaks when testing Jira.

### 🔴 CB-4: CI Scan API bypasses app count limits
**Impact:** Any API key holder can create unlimited monitored apps.  
**File:** `src/app/api/public/ci-scan/route.ts`  
**Fix:** 20 minutes. Add tier gate before auto-creating app.  
**Revenue Impact:** HIGH — allows tier arbitrage.

---

## High-Priority Issues (Fix within 1 week)

### HP-1: Trends endpoint has no tier gate
- **Impact:** FREE users can access 30-day trends (premium feature)
- **Fix:** 15 min. Add `getOrgLimits()` check.

### HP-2: Middleware silently skips JWT verification when env var missing
- **Impact:** Auth can fail-open if JWT_SECRET missing
- **Fix:** 10 min. Fail hard instead of silent skip.

### HP-3: No retry logic on alerting (Teams, PagerDuty, GitHub)
- **Impact:** Single transient failure silently drops critical alerts
- **Fix:** 2-4 hours. Add exponential backoff for critical findings.

### HP-5: Jira test endpoint missing tier gate
- **Impact:** Downgraded teams can still trigger Jira test calls
- **Fix:** 10 min. Copy tier gate from main Jira endpoint.

---

## Medium-Priority Issues (Fix within 2 weeks)

### MP-1: Marketing copy violates guidelines
- 9+ pages use em dashes (banned)
- "can", "just", "may" scattered throughout
- Fix: 2 hours. Content sweep.

### MP-2: Landing page claims "20 checks" but shows only 12
- **Impact:** Enterprise buyers who count will notice the gap
- **Fix:** 1 hour. Show all 20 checks or update copy.

### MP-3: Starter tier is undercooked
- No API access, no integrations = feels unfinished
- Consider: Remove Starter entirely, or add missing features

### MP-4: Dashboard copy is weak
- "Portfolio" heading is jargon-heavy
- "Summary cards" don't explain what "Healthy/Warning/Critical" means
- Consider: "Your App Health" + tooltips explaining each status

---

## UI/UX Audit Results

### ✅ What's Good
- **Clean dashboard design:** Portfolio table is scannable, status badges are clear
- **Design tokens enforced:** Colors, spacing, typography all use consistent tokens
- **Auth flow is frictionless:** Signup → email verification → dashboard in <2 min
- **Results display is clear:** Finding grade (0-100) is prominent, explanations are plain-language
- **Mobile responsive:** Tested on iPad and mobile — layout holds up

### ❌ What Needs Work
1. **Landing page copy is jargon-heavy:** "Exposed endpoints," "dangerouslySetInnerHTML," "CSP" mean nothing to non-technical buyers
   - Reframe with examples: "Detects when your app is accidentally leaking AWS credentials"
   
2. **Tier comparison table is hard to read:** 5 tiers × 8 features = 40 cells of micro-copy
   - Simplify: Show only FREE, PRO, ENTERPRISE on landing page. Omit STARTER. Move ENTERPRISE_PLUS to "Custom" button.

3. **"Scan results" page lacks actionable next steps:**
   - Shows the finding + plain-English explanation ✓
   - Lacks "How to fix this" section
   - Lacks "Ignore this finding" checkbox (causes friction with false positives)

4. **No empty states:** When an org has 0 apps, the dashboard shows generic "Add your first app" text
   - Should show a hero image + step-by-step onboarding

5. **Metric cards lack tooltips:** What does "MTTA 4h" mean? (Mean Time To Acknowledge)
   - Add hover tooltips explaining each metric

6. **Form validation is silent:** If you submit an invalid app URL, no error appears
   - Need inline validation feedback

---

## Competitive Positioning

### Who We Compete With
- **Snyk** (SCA for dependencies)
- **Dependabot/Renovate** (automated dep updates)
- **OWASP ZAP** (manual pen testing)
- **Burp Suite** (security testing)

### Our Advantage
- **No SDK integration required** — works with any web app
- **Focused on AI-built app risks** — catches LLM-specific patterns (inline scripts, client-side auth)
- **External monitoring** — catches prod issues, not just dev-time

### Positioning by Tier

**Builder (Free):** "Your AI app's security blindspot"
- Goal: Get founders to see Scantient finds real leaks
- Aha moment: "Oh no, my Stripe key is exposed"

**Pro ($399):** "AI app security integrated into your workflow"
- Goal: Make it easy to act on findings (Jira tickets, API access for CI/CD)
- Aha moment: "I can now auto-fail deployments if Scantient finds secrets"

**Enterprise ($1,500):** "Portfolio governance for AI-built apps"
- Goal: Give CISOs a dashboard showing the security posture of 100+ internal tools
- Aha moment: "Board report showing we found and fixed 200 findings"

---

## Feature Gaps

### Free Tier
**Currently Missing:**
- Context on each finding (why is this risky?)
- Fix suggestions (how do I address this?)
- Ignore/snooze ability (suppress noisy checks)

**Impact:** Free users get frustrated by false positives and churn.

### Pro Tier
**Currently Missing:**
- **Custom scan profiles** (e.g., "skip auth checks for internal-only apps")
- **Bulk action** (silence same finding across 5 apps at once)
- **Webhook signature verification** (security best practice)

**Impact:** Ops teams doing manual workarounds instead of using the product.

### Enterprise Tier
**Currently Missing:**
- **White-label dashboard** (for MSPs reselling Scantient)
- **Custom reports** (orgs want findings broken down by app, severity, remediation time)
- **IP whitelisting** (orgs want scans from known IPs only)
- **Custom SLA tracking** (auto-escalate if finding open >7 days)

**Impact:** Enterprise deals stall at "we need to customize this."

---

## Quick Wins (1-2 days each, ship immediately)

### QW-1: Fix Jira Integration (CB-3) — 20 min
Remove `https://` prefix in URL construction. Test in CI. Ship immediately.

### QW-2: Fix ENTERPRISE_PLUS tier gate (CB-1 + CB-2) — 1.5 hours
Add ENTERPRISE_PLUS to Prisma enum, update scan interval maps, migrate existing ENTERPRISE_PLUS rows. Ship in a hotfix PR.

### QW-3: Fix CI Scan API limit bypass (CB-4) — 30 min
Add `canAddApp()` check before auto-creating app. Return 403 with upgrade prompt. Ship in same hotfix PR.

### QW-4: Add tier gate to trends endpoint (HP-1) — 20 min
Add `getOrgLimits()` check, only allow PRO+. Ship in same hotfix PR.

### QW-5: Fix Jira test endpoint tier gate (HP-5) — 10 min
Copy tier gate from main Jira endpoint. Ship in same hotfix PR.

**Total effort:** 2.5 hours. **Ship as:** Single PR "fix: critical billing and tier-gate bugs (CB1-4, HP1, HP5)"

---

## Medium-Term Improvements (1-2 weeks each)

### MT-1: Simplify Pricing Page
**What:** Remove STARTER tier from landing page, simplify 5-tier table to 3-tier comparison
**Why:** STARTER is confusing (between FREE and PRO, no one picks it)
**How:** Show FREE, PRO, ENTERPRISE. Move ENTERPRISE_PLUS to "Custom" CTA. Keep STARTER in DB for legacy customers.
**Effort:** 4 hours (design + copy + test)

### MT-2: Add "How to Fix" to Finding Details
**What:** Every finding gets a remediation guide (e.g., "Add CSP header: Content-Security-Policy: default-src 'self'")
**Why:** Actionability. Developers need to know _how_ to fix it, not just _that_ it exists.
**How:** Seed a database of fix templates (12 findings × 3-5 variations each)
**Effort:** 2 days (template design + testing)

### MT-3: Add Ignore/Snooze to Findings
**What:** Users can suppress a specific finding on a specific app for 30 days
**Why:** False positives kill engagement. "Not a vulnerability" must be clickable.
**How:** Add `suppressed` boolean to Finding model, add snooze UI to finding detail page
**Effort:** 1 day (schema + UI + tests)

### MT-4: Rewrite Landing Page Copy
**What:** Remove jargon, add examples, focus on value
**Why:** Current copy assumes IT security expertise (target audience: founders and IT managers, not security specialists)
**Examples:**
- "Your Stripe API key is visible in client-side JavaScript" instead of "Exposed API keys"
- "Attackers can log in as any user (no auth checks)" instead of "Client-side auth bypass"
**Effort:** 1 day (copy + design review)

### MT-5: Retry Logic for Critical Alerts (HP-3)
**What:** Add exponential backoff (2-3 retries) for CRITICAL finding alerts to Teams, PagerDuty, GitHub
**Why:** Transient failures (timeout, 503) shouldn't drop critical alerts
**How:** Queue alerts with retry metadata, add background job to retry failed alerts
**Effort:** 1.5 days (implementation + testing)

### MT-6: Add Tooltips to Dashboard Metrics
**What:** Hover over "MTTA", "Finding Velocity", "Security Score" shows definitions
**Why:** Dashboard shows data but doesn't explain what to do about it
**How:** Lucide icons + Tooltip component in design system
**Effort:** 4 hours (component + copy + test)

---

## One Metric That Matters

**Primary North Star: Trial-to-Paid Conversion Rate**

After fixing CB1-4 (the critical bugs), the next focus is:
- Track how many FREE → PRO conversions happen (target: >3%)
- Identify bottlenecks: Do they not see value? Don't understand pricing? Don't know how to add second app?
- A/B test the landing page, onboarding, and pricing page

---

## Recommended Phase 2 (Next Week)

**Priority 1 (Thu-Fri 2026-03-06/07):**
1. Ship QW1-5 (fix critical bugs) — 2.5 hours
2. Test hotfix against all tier gates
3. Deploy to production
4. Monitor for errors

**Priority 2 (Mon-Tue 2026-03-10/11):**
1. MT-1 (simplify pricing page) — 4 hours
2. MT-4 (rewrite landing copy) — 4 hours
3. A/B test new landing page

**Priority 3 (Wed-Fri 2026-03-12/14):**
1. MT-2 (add remediation guides) — 2 days
2. MT-3 (add snooze/ignore) — 1 day

**Success metric:** By end of week, have <2% sign-up-to-paid conversion rate baseline. Everything after that is optimization.

---

## Deployment Checklist

- [ ] All 5 quick wins merged and tested
- [ ] ENTERPRISE_PLUS tier fully functional (storage + scan interval + features)
- [ ] Jira integration tested end-to-end
- [ ] CI Scan API respects tier limits
- [ ] Trends endpoint gated to PRO+
- [ ] No errors in Sentry dashboard after deploy
- [ ] Manual test: Create ENTERPRISE_PLUS org, verify 1-hour scan interval
- [ ] Manual test: Create Jira ticket from finding, confirm it appears in Jira
- [ ] Manual test: Try to add 6th app as BUILDER user, confirm 403

---

## Next Steps

1. **Immediately:** Run the quick wins (2.5 hours)
2. **After hotfix ships:** Measure trial conversion baseline
3. **Next week:** Design + ship medium-term wins (MT1-4)
4. **End of month:** Hit >5% trial-to-paid, prepare $399 tier for growth push

---

_Audit completed: 2026-03-05 02:XX UTC_  
_Scope: Codebase exploration, tier analysis, UI/UX walkthrough, competitive positioning_  
_Next audit: Post-Phase 2 ship (by 2026-03-14) to validate improvements_
