/**
 * Analytics event tracking client for Scantient funnel conversion tracking.
 * 
 * Events are queued and batched to /api/analytics/events endpoint.
 * Auto-flushes on page unload or periodic (30s).
 * 
 * Usage:
 *   import { trackEvent } from '@/lib/events';
 *   trackEvent('hero_cta_clicked', { variant: 'start-scan' });
 */

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp?: number;
  sessionId?: string;
  userId?: string | null;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
  referrer?: string;
}

interface QueuedEvent extends AnalyticsEvent {
  id: string; // deduplicate retries
}

class EventsClient {
  private queue: QueuedEvent[] = [];
  private sessionId: string;
  private maxQueueSize = 50;
  private flushInterval = 30000; // 30 seconds
  private flushTimer: NodeJS.Timeout | null = null;
  private endpoint = '/api/analytics/events';
  private userId: string | null = null;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeSession();
    this.attachUnloadHandler();
  }

  private initializeSession() {
    // Restore from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('scantient_session_id');
      if (stored) {
        this.sessionId = stored;
      } else {
        localStorage.setItem('scantient_session_id', this.sessionId);
      }

      // Track landing page view
      this.track('landing_page_viewed', {
        path: window.location.pathname,
        referrer: document.referrer || 'direct',
      });

      // Auto-flush periodically
      this.startAutoFlush();
    }
  }

  private generateSessionId(): string {
    const now = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${now}-${random}`;
  }

  private getUTMParams(): AnalyticsEvent['utm'] {
    if (typeof window === 'undefined') return undefined;

    const params = new URLSearchParams(window.location.search);
    return {
      source: params.get('utm_source') || undefined,
      medium: params.get('utm_medium') || undefined,
      campaign: params.get('utm_campaign') || undefined,
    };
  }

  private startAutoFlush() {
    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }

  private attachUnloadHandler() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeunload', () => {
      this.flush(); // Sync flush on page unload
    });
  }

  /**
   * Track an event (will batch and send)
   */
  public track(name: string, properties?: Record<string, unknown>) {
    const event: QueuedEvent = {
      name,
      properties,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
      utm: this.getUTMParams(),
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      id: `${name}-${Date.now()}-${Math.random()}`,
    };

    this.queue.push(event);

    // Auto-flush if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      this.flush();
    }
  }

  /**
   * Set user ID after authentication
   */
  public setUserId(userId: string | null) {
    this.userId = userId;
  }

  /**
   * Flush queued events to server (async)
   */
  public async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const events = this.queue.splice(0, this.maxQueueSize);

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        // Don't wait for response — fire and forget
        keepalive: true,
      });
    } catch (error) {
      // Re-queue events if send fails (offline, network error)
      this.queue.unshift(...events);
      console.warn('[Scantient Analytics] Failed to send events:', error);
    }
  }

  /**
   * Stop background flush (cleanup)
   */
  public destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush(); // Final flush
  }
}

// Singleton instance
const eventsClient = new EventsClient();

// Export convenience functions
export function trackEvent(name: string, properties?: Record<string, unknown>) {
  eventsClient.track(name, properties);
}

export function setAnalyticsUserId(userId: string | null) {
  eventsClient.setUserId(userId);
}

export function flushAnalytics() {
  return eventsClient.flush();
}

export function destroyAnalytics() {
  eventsClient.destroy();
}

export default eventsClient;
