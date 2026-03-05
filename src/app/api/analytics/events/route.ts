/**
 * POST /api/analytics/events
 * 
 * Ingests analytics events from the client and stores them in the database.
 * No authentication required (public endpoint for anonymous tracking).
 * 
 * Request body:
 * {
 *   "events": [
 *     {
 *       "name": "hero_cta_clicked",
 *       "properties": { ... },
 *       "timestamp": 1709611532123,
 *       "sessionId": "session-id",
 *       "userId": "user-id or null",
 *       "utm": { source, medium, campaign },
 *       "referrer": "https://google.com"
 *     }
 *   ]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';

// Schema validation for incoming events
const EventSchema = z.object({
  name: z.string().min(1).max(100),
  properties: z.record(z.unknown()).optional(),
  timestamp: z.number().positive(),
  sessionId: z.string(),
  userId: z.string().nullable().optional(),
  utm: z.object({
    source: z.string().optional(),
    medium: z.string().optional(),
    campaign: z.string().optional(),
  }).optional(),
  referrer: z.string().optional(),
});

const RequestSchema = z.object({
  events: z.array(EventSchema).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json();
    const validated = RequestSchema.parse(body);

    // Store events in database
    const insertedEvents = await Promise.all(
      validated.events.map((event) =>
        prisma.analyticsEvent.create({
          data: {
            name: event.name,
            properties: event.properties || {},
            sessionId: event.sessionId,
            userId: event.userId || null,
            utmSource: event.utm?.source || null,
            utmMedium: event.utm?.medium || null,
            utmCampaign: event.utm?.campaign || null,
            referrer: event.referrer || null,
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
            userAgent: request.headers.get('user-agent') || null,
            createdAt: new Date(event.timestamp),
          },
        })
      )
    );

    return NextResponse.json(
      {
        success: true,
        eventsStored: insertedEvents.length,
      },
      { status: 202 } // 202 Accepted (async processing)
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request schema',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    console.error('[Analytics] Event ingestion error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process events',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/events?limit=100
 * 
 * Returns recent analytics events (admin only).
 * TODO: Add auth check (org owner or admin)
 */
export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '100'),
      1000
    );

    const events = await prisma.analyticsEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ events, total: events.length });
  } catch (error) {
    console.error('[Analytics] Query error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
