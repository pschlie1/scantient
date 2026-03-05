# PERFORMANCE_DASHBOARD.md - Monitoring & Baselines

**Date:** 2026-03-05 04:25 UTC  
**Phase:** 4 (Monitoring, Deployment & Conversion Optimization)  
**Status:** ⏳ Baselines to be established after deployment  

---

## Overview

Performance monitoring tracks Core Web Vitals (LCP, CLS, FCP, TTFB) and API latency to ensure a fast, reliable user experience.

**Why it matters:**
- LCP >2.5s = users abandon (20% lift per 100ms improvement)
- CLS >0.1 = layout jank frustrates users
- API p95 >500ms = features feel slow

---

## 🎯 Core Web Vitals Thresholds

### Largest Contentful Paint (LCP)
**Measures:** Time until largest visual element renders  
**Good:** ≤ 2.5s  
**Needs Improvement:** 2.5 - 4.0s  
**Poor:** > 4.0s  

**What affects LCP:**
- Server response time (TTFB)
- JavaScript rendering time
- CSS blocking
- Large images/videos

**Optimization:**
- Cache static assets aggressively
- Optimize server response (<600ms)
- Lazy-load below-the-fold images
- Inline critical CSS

### Cumulative Layout Shift (CLS)
**Measures:** Unexpected visual movement during page load  
**Good:** ≤ 0.1  
**Needs Improvement:** 0.1 - 0.25  
**Poor:** > 0.25  

**What causes CLS:**
- Images/videos without dimensions
- Ads/embeds that load late
- Fonts that swap with fallbacks
- Injected content above page

**Optimization:**
- Set explicit width/height on images
- Reserve space for ads
- Use `font-display: swap` carefully
- Avoid layout-causing CSS changes

### First Contentful Paint (FCP)
**Measures:** Time to first pixel (text or image)  
**Good:** ≤ 1.8s  
**Needs Improvement:** 1.8 - 3.0s  
**Poor:** > 3.0s  

**Optimization:**
- Defer non-critical JavaScript
- Reduce CSS bundle size
- Use async fonts

### Time to First Byte (TTFB)
**Measures:** Time from request sent to first byte received  
**Good:** ≤ 800ms  
**Needs Improvement:** 800 - 1800ms  
**Poor:** > 1800ms  

**Optimization:**
- Server response time (database queries, API calls)
- CDN caching headers
- Minimize middleware processing

---

## 📊 API Performance Baseline

### Expected Latencies (p95)
| Endpoint | Tier | Target | Alert |
|----------|------|--------|-------|
| `/api/auth/login` | All | 200ms | >500ms |
| `/api/apps` | All | 100ms | >300ms |
| `/api/apps/[id]/scan` | FREE | 150ms | >400ms |
| `/api/apps/[id]/scan` | PRO | 150ms | >400ms |
| `/api/findings` | All | 150ms | >500ms |
| `/api/metrics/trends` | PRO+ | 300ms | >1000ms |
| `/api/integrations/jira/ticket` | PRO+ | 800ms | >2000ms |

### Slow Request Thresholds
- **Warning:** p95 > 500ms (log to Sentry, analytics)
- **Critical:** p99 > 1000ms (alert on-call, create ticket)
- **Incident:** >50% of requests fail or timeout

---

## 🚨 Alert Rules (Sentry Integration)

### Alert 1: LCP Degradation
```
Trigger: LCP median > 2.5s over 5 minutes
Action: Post to #performance Slack
Severity: Warning
Investigation: Check database slow-log, API latency, CPU usage
```

### Alert 2: CLS Spikes
```
Trigger: CLS > 0.1 (average) over 10 minutes
Action: Post to #performance Slack
Severity: Info
Investigation: Check for injected content, late-loading ads
```

### Alert 3: API Latency P95
```
Trigger: Any API endpoint p95 > 500ms
Action: Create GitHub issue, notify on-call
Severity: High
Investigation: Database query analysis, cache invalidation
```

### Alert 4: Error Rate Spike
```
Trigger: Error rate > 1% of requests
Action: PagerDuty alert + Slack #incidents
Severity: Critical
Investigation: Check error type, recent deployments
```

---

## 📈 Monitoring Dashboards

### Sentry Dashboard
**Path:** https://sentry.io/organizations/dooder-digital/issues/  
**Filter:** scantient project

**What to watch:**
- Performance breadcrumbs (LCP, CLS, TTFB)
- Custom measurements (API latency)
- Transaction duration (page load time)

**Baseline Metrics (to be established):**
- Median LCP: ___ ms
- P95 LCP: ___ ms
- Median CLS: ___
- Error rate: ____%

### Vercel Analytics
**Path:** https://vercel.com/dashboard → scantient → Analytics

**Metrics:**
- Core Web Vitals by page
- Traffic patterns
- Deployment impact

### Custom API Dashboard
**Path:** `/api/analytics/performance` (to build)

**Queries:**
```bash
# API response times over last 7 days
GET /api/analytics/performance?metric=api_latency&days=7

# Core Web Vitals distribution
GET /api/analytics/performance?metric=web_vitals&days=7

# Error rate by endpoint
GET /api/analytics/performance?metric=error_rate&days=7
```

---

## 🔍 Debugging Performance Issues

### Step 1: Identify Bottleneck
```bash
# Check Sentry for LCP/CLS metrics
# Look for patterns: specific browser? device? region?

# Check Vercel Analytics
# Is slowness affecting all users or subset?
```

### Step 2: Database Query Analysis
```sql
-- Find slow queries (>100ms)
SELECT query, mean_time, calls
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC;
```

### Step 3: Network Waterfall
```bash
# In Chrome DevTools:
# 1. Open Network tab
# 2. Reload page
# 3. Look for:
#    - Slow DNS lookups (red)
#    - Slow TCP connection (orange)
#    - Slow server response (blue)
#    - Large transfers (size column)
```

### Step 4: JavaScript Profile
```bash
# In Chrome DevTools:
# 1. Open Performance tab
# 2. Record page load
# 3. Look for long tasks (>50ms)
# 4. Check JavaScript execution time
```

---

## 🚀 Optimization Roadmap

### Week 1 (Baseline)
- [ ] Deploy performance monitoring
- [ ] Capture 7 days of data
- [ ] Establish baselines for each metric
- [ ] Identify slowest page and API endpoint

### Week 2 (Quick Wins)
- [ ] Optimize static assets (gzip, minify, cache headers)
- [ ] Lazy-load images below fold
- [ ] Defer non-critical JavaScript
- [ ] Target: 10% LCP improvement

### Week 3+ (Deep Optimization)
- [ ] Database query optimization
- [ ] API endpoint caching strategy
- [ ] Consider CDN for static assets
- [ ] Server-side rendering optimization

---

## 📋 Baseline Metrics (To Be Populated)

**Established:** _____ (post-deployment)  
**Period:** Last 7 days  

### Core Web Vitals
| Metric | Median | P75 | P95 | Rating |
|--------|--------|-----|-----|--------|
| LCP | ___ ms | ___ ms | ___ ms | ___ |
| CLS | ___ | ___ | ___ | ___ |
| FCP | ___ ms | ___ ms | ___ ms | ___ |
| TTFB | ___ ms | ___ ms | ___ ms | ___ |

### API Latency (ms, p95)
| Endpoint | Latency | Slowest Route |
|----------|---------|---------------|
| Login | ___ | ___ |
| List Apps | ___ | ___ |
| Run Scan | ___ | ___ |
| List Findings | ___ | ___ |
| Jira Integration | ___ | ___ |

### Error Metrics
| Metric | Value | Trend |
|--------|-------|-------|
| Error Rate | ___% | ↗️↘️→ |
| 5xx Errors | ___ | ↗️↘️→ |
| Timeout Errors | ___ | ↗️↘️→ |
| Auth Failures | ___ | ↗️↘️→ |

### Page Performance
| Page | LCP | CLS | Users |
|------|-----|-----|-------|
| Landing (/) | ___ | ___ | ___ |
| Dashboard | ___ | ___ | ___ |
| Findings | ___ | ___ | ___ |
| Settings | ___ | ___ | ___ |

---

## 🔧 Integration with Sentry

**Automatic Tracking:**
- ✅ LCP captured every page load
- ✅ CLS captured every page load
- ✅ Slow APIs logged (>500ms)
- ✅ Errors with performance context

**Manual Tracking (as needed):**
```ts
import { trackPerformanceMetric } from '@/lib/performance';

// Track custom operations
trackPerformanceMetric('Custom Operation', 1234); // 1234ms
```

---

## 📞 Response Procedures

**If LCP > 3s on landing page:**
1. Check if server (TTFB) is slow
2. If yes → database/API bottleneck (priority 1)
3. If no → JavaScript parsing/rendering (priority 2)
4. Profile in DevTools, identify largest script
5. Plan: code-split, lazy-load, or defer

**If CLS > 0.1:**
1. Open DevTools, look for layout shifts
2. Check for images without dimensions
3. Check for late-loading ads or modals
4. Add `width`/`height` attributes or `aspect-ratio` CSS

**If API latency spikes:**
1. Check Sentry for errors
2. Check database for slow queries
3. Check rate limiting (429 responses)
4. Might indicate database connection pool exhausted

---

## 📚 Resources

- [Web.dev Performance Guide](https://web.dev/performance/)
- [Core Web Vitals Guide](https://web.dev/vitals/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Vercel Analytics](https://vercel.com/analytics)
- [PostgreSQL EXPLAIN ANALYZE](https://www.postgresql.org/docs/current/sql-explain.html)

---

**PERFORMANCE_DASHBOARD.md Created: 2026-03-05 04:25 UTC**  
**Status: Monitoring infrastructure ready | Baselines pending deployment**
