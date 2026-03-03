# ACTIVE-TASK.md — Phase 3 Pricing/GTM Rollout

## Status: IN PROGRESS

## Task
Execute Phase 3 for Scantient pricing + GTM rollout:
1) Final pricing/copy alignment for 4-tier customer-facing model (Builder, Starter, Pro, Enterprise) while preserving backend `ENTERPRISE_PLUS` compatibility.
2) Outreach execution artifact for dual motion (20 builder communities + 20 IT/security buyer channels + short pitch templates).
3) Conversion instrumentation for Builder→Starter, Starter→Pro, and churn events, wired into existing analytics.

## Concrete Plan (approved to execute)

### Step 1 — Baseline + branch
- Create feature branch from `main`.
- Inspect customer-facing copy and plan-gating logic.
- Risks: accidental edits to backend enum handling.
- Validation: `git diff` limited to intended files.

### Step 2 — Pricing/copy alignment sweep
- Update customer-facing copy that mentions "Enterprise Plus" where 4-tier messaging should be shown.
- Keep backend enum + Stripe/DB mappings untouched.
- Prefer centralized tier capability checks for any touched gating logic.
- Target files (likely):
  - `src/app/(dashboard)/reports/executive/page.tsx`
  - any marketing/docs pages with inconsistent customer-facing tier copy
- Risks: creating mismatch between UI copy and real entitlement behavior.
- Validation: spot-check with grep for "Enterprise Plus" in customer-facing surfaces.

### Step 3 — Outreach execution artifact
- Add a GTM-ready artifact doc with:
  - 20 builder communities/channels
  - 20 IT/security buyer channels
  - short outreach pitch templates for both segments
- Target file:
  - `docs/outreach/phase-3-dual-motion-outreach.md`
- Risks: low quality/non-actionable channel list.
- Validation: ensure practical format with link/why it matters/CTA notes.

### Step 4 — Conversion instrumentation
- Extend analytics event schema with plan-conversion + churn events.
- Wire events in Stripe webhook transitions:
  - Builder(FREE) → Starter
  - Starter → Pro
  - churn (paid tier to FREE on subscription delete)
- Keep events privacy-safe and non-blocking.
- Target files:
  - `src/lib/analytics.ts`
  - `src/app/api/stripe/webhook/route.ts`
  - `src/lib/wave3-reporting.ts`
  - optionally readiness UI if needed
- Risks: duplicate events from webhook retries, broken TypeScript unions.
- Mitigation: only emit on real tier transitions by comparing previous and new tier.
- Validation: TypeScript build + targeted tests.

### Step 5 — Verify + ship
- Run `npx tsc --noEmit` (must be zero errors).
- Run relevant tests around webhook/reporting if available.
- Commit on feature branch, push, open PR.
- Capture env/config changes explicitly (if none, say none).

## Current checkpoint
- Plan written.
- Repo baseline checked.
- Feature branch created: `feat/phase3-pricing-gtm-rollout`.
- Step 2 complete: customer-facing copy aligned (removed Enterprise Plus wording from executive report paywall copy) and gating now uses centralized tier capability map (`hasFeature`).
- Step 3 complete: outreach artifact added with 20 builder communities + 20 IT/security buyer channels + short pitch templates.
- Step 4 complete: conversion instrumentation added for Builder→Starter, Starter→Pro, and churn via Stripe webhook + reporting updates + docs.
- Verification complete: `npx tsc --noEmit` passed (0 errors), targeted webhook/tier regression test passed (`tier-gate-audit-3.test.ts`).
- Changes committed on feature branch and pushed.
- PR opened: https://github.com/pschlie1/scantient/pull/85
- Status: COMPLETE.
