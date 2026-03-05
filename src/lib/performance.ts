/**
 * Performance monitoring for Core Web Vitals (LCP, CLS, FCP, TTFB)
 * 
 * Captures metrics and sends to Sentry + Analytics endpoint.
 * Provides baseline metrics for optimization.
 * 
 * Usage:
 *   import { initPerformanceMonitoring } from '@/lib/performance';
 *   initPerformanceMonitoring();
 */

import { onCLS, onFCP, onLCP, onTTFB, type Metric } from 'web-vitals';
import * as Sentry from '@sentry/nextjs';
import { trackEvent } from '@/lib/events';

interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

// Thresholds from Web.dev (good | needs improvement | poor)
const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 }, // Largest Contentful Paint
  FCP: { good: 1800, poor: 3000 }, // First Contentful Paint
  CLS: { good: 0.1, poor: 0.25 }, // Cumulative Layout Shift
  TTFB: { good: 800, poor: 1800 }, // Time to First Byte
};

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds = THRESHOLDS[name as keyof typeof THRESHOLDS];
  if (!thresholds) return 'needs-improvement';

  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.poor) return 'needs-improvement';
  return 'poor';
}

function sendMetricToSentry(metric: PerformanceMetric) {
  // Log as breadcrumb for context in error reports
  Sentry.captureMessage(`Performance: ${metric.name} = ${metric.value.toFixed(0)}ms (${metric.rating})`, 'info');

  // Set metric as custom measurement (viewable in Sentry dashboard)
  Sentry.setContext('performance', {
    [metric.name]: metric.value.toFixed(0),
  });

  // Set gauge for p95 monitoring
  if (metric.rating === 'poor') {
    Sentry.captureMessage(
      `⚠️ Performance Alert: ${metric.name} is ${metric.rating} (${metric.value.toFixed(0)})`,
      'warning'
    );
  }
}

function sendMetricToAnalytics(metric: PerformanceMetric) {
  trackEvent('performance_metric', {
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
  });
}

// Export for manual tracking if needed
export function trackPerformanceMetric(name: string, value: number) {
  const metric: PerformanceMetric = {
    name,
    value,
    rating: getRating(name, value),
    delta: 0,
    id: `${name}-${Date.now()}`,
  };

  sendMetricToSentry(metric);
  sendMetricToAnalytics(metric);

  return metric;
}

// Core Web Vitals handlers
function handleLCP(metric: Metric) {
  const perfMetric: PerformanceMetric = {
    name: 'LCP',
    value: metric.value,
    rating: getRating('LCP', metric.value),
    delta: metric.delta ?? 0,
    id: metric.id,
  };

  sendMetricToSentry(perfMetric);
  sendMetricToAnalytics(perfMetric);

  // Alert if LCP is poor
  if (perfMetric.rating === 'poor') {
    console.warn(`⚠️ LCP is ${perfMetric.rating}: ${perfMetric.value.toFixed(0)}ms`);
  }
}

function handleFCP(metric: Metric) {
  const perfMetric: PerformanceMetric = {
    name: 'FCP',
    value: metric.value,
    rating: getRating('FCP', metric.value),
    delta: metric.delta ?? 0,
    id: metric.id,
  };

  sendMetricToSentry(perfMetric);
}

function handleCLS(metric: Metric) {
  const perfMetric: PerformanceMetric = {
    name: 'CLS',
    value: metric.value,
    rating: getRating('CLS', metric.value),
    delta: metric.delta ?? 0,
    id: metric.id,
  };

  sendMetricToSentry(perfMetric);

  if (perfMetric.rating === 'poor') {
    console.warn(`⚠️ CLS is ${perfMetric.rating}: ${perfMetric.value.toFixed(3)}`);
  }
}

function handleTTFB(metric: Metric) {
  const perfMetric: PerformanceMetric = {
    name: 'TTFB',
    value: metric.value,
    rating: getRating('TTFB', metric.value),
    delta: metric.delta ?? 0,
    id: metric.id,
  };

  sendMetricToSentry(perfMetric);
}

/**
 * Initialize performance monitoring
 * Call this in your root layout or app entrypoint
 */
export function initPerformanceMonitoring() {
  if (typeof window === 'undefined') return;

  // Register Web Vitals listeners
  onLCP(handleLCP);
  onFCP(handleFCP);
  onCLS(handleCLS);
  onTTFB(handleTTFB);

  // Monitor Long Tasks (if available)
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            // Report tasks taking >50ms
            trackPerformanceMetric('Long Task', entry.duration);
          }
        }
      });

      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // longtask observer not supported in all browsers
    }
  }

  // Monitor API response times
  monitorAPITiming();
}

/**
 * Intercept fetch calls to track API latency
 */
function monitorAPITiming() {
  const originalFetch = window.fetch;

  window.fetch = function (this: typeof window, ...args) {
    const startTime = performance.now();
    let url: string | undefined;
    if (typeof args[0] === 'string') {
      url = args[0];
    } else if (args[0] instanceof URL) {
      url = args[0].toString();
    } else if (args[0] && typeof args[0] === 'object' && 'url' in args[0]) {
      url = (args[0] as Request).url;
    }

    return originalFetch.apply(this, args as Parameters<typeof window.fetch>).then((response) => {
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Log slow APIs (>500ms)
      if (duration > 500) {
        trackEvent('slow_api_request', {
          endpoint: url?.split('?')[0], // Remove query params
          duration_ms: Math.round(duration),
          status: response.status,
        });

        Sentry.captureMessage(
          `Slow API: ${url} took ${duration.toFixed(0)}ms`,
          'info'
        );
      }

      return response;
    });
  } as typeof window.fetch;
}

/**
 * Get current performance summary (for dashboard)
 * Returns captured metrics over time
 */
export function getPerformanceSummary(): {
  vitals: { lcp?: number; fcp?: number; cls?: number; ttfb?: number };
  theme: string;
} {
  const perfData =
    (window as any).__SCANTIENT_PERF__ ||
    {
      lcp: undefined,
      fcp: undefined,
      cls: undefined,
      ttfb: undefined,
    };

  return {
    vitals: perfData,
    theme: 'light',
  };
}

/**
 * For manual performance tracking (e.g., custom metrics)
 */
export function measureOperation<T>(
  name: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  const start = performance.now();

  try {
    const result = fn();

    if (result instanceof Promise) {
      return result.finally(() => {
        const duration = performance.now() - start;
        trackPerformanceMetric(`Operation: ${name}`, duration);
      }) as Promise<T>;
    }

    const duration = performance.now() - start;
    trackPerformanceMetric(`Operation: ${name}`, duration);

    return result;
  } catch (error) {
    const duration = performance.now() - start;
    trackPerformanceMetric(`Operation: ${name} (error)`, duration);
    throw error;
  }
}

export default {
  init: initPerformanceMonitoring,
  track: trackPerformanceMetric,
  measure: measureOperation,
};
