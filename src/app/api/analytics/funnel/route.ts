/**
 * GET /api/analytics/funnel
 * 
 * Returns conversion funnel metrics:
 * - Top of funnel: Landing page views, CTA clicks
 * - Middle of funnel: Auth, app setup, free scans
 * - Bottom of funnel: Signups, upgrades, payments
 * 
 * Query params:
 *   - days=7 (default): analyze last N days
 *   - exclude_internal=true: filter out internal testing
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

interface FunnelStage {
  name: string;
  event: string;
  count: number;
  conversionRate: number;
  avgTimeToNext: number; // milliseconds
}

export async function GET(request: NextRequest) {
  try {
    const days = Math.min(
      parseInt(request.nextUrl.searchParams.get('days') || '7'),
      365
    );
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Funnel stages (in order)
    const stages = [
      { name: 'Landing Page View', event: 'landing_page_viewed' },
      { name: 'Hero CTA Click', event: 'hero_cta_clicked' },
      { name: 'Pricing CTA Click', event: 'pricing_cta_clicked' },
      { name: 'Auth Started', event: 'auth_started' },
      { name: 'Auth Completed', event: 'auth_completed' },
      { name: 'First App Added', event: 'first_app_added' },
      { name: 'Free Scan Initiated', event: 'free_scan_started' },
      { name: 'Free Scan Completed', event: 'free_scan_completed' },
      { name: 'Upgrade Clicked', event: 'upgrade_clicked' },
      { name: 'Stripe Checkout', event: 'stripe_checkout_opened' },
      { name: 'Payment Completed', event: 'payment_completed' },
    ];

    // Fetch counts for each stage
    const stageCounts = await Promise.all(
      stages.map((stage) =>
        prisma.analyticsEvent.count({
          where: {
            name: stage.event,
            createdAt: { gte: since },
          },
        })
      )
    );

    // Calculate conversion rates and timing
    const funnel: FunnelStage[] = stages.map((stage, index) => {
      const count = stageCounts[index];
      const previousCount = index > 0 ? stageCounts[index - 1] : count;
      const conversionRate = previousCount > 0 ? (count / previousCount) * 100 : 100;

      return {
        name: stage.name,
        event: stage.event,
        count,
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgTimeToNext: 0, // TODO: calculate from event timestamps
      };
    });

    // Key metrics
    const totalLanded = funnel[0]?.count || 0;
    const totalSignups = funnel[4]?.count || 0; // auth_completed
    const totalPaid = funnel[10]?.count || 0; // payment_completed

    const signupRate = totalLanded > 0 ? (totalSignups / totalLanded) * 100 : 0;
    const paidRate = totalSignups > 0 ? (totalPaid / totalSignups) * 100 : 0;

    return NextResponse.json({
      period: { days, since, until: now },
      keyMetrics: {
        totalLanded,
        totalSignups,
        totalPaid,
        signupRate: Math.round(signupRate * 100) / 100,
        paidRate: Math.round(paidRate * 100) / 100,
        lifetime: {
          landingPageToSignup: `${Math.round(signupRate)}%`,
          signupToPaid: `${Math.round(paidRate)}%`,
          landingPageToPaid: `${Math.round((signupRate * paidRate) / 100)}%`,
        },
      },
      funnel,
      dropoff: {
        // Identify where users drop off most
        biggest: funnel.reduce((prev, curr) =>
          curr.conversionRate < prev.conversionRate ? curr : prev
        ),
      },
    });
  } catch (error) {
    console.error('[Analytics] Funnel query error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch funnel metrics' },
      { status: 500 }
    );
  }
}
