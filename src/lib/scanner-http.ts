import { addHours } from "date-fns";
import { db } from "@/lib/db";
import { isPrivateUrl, ssrfSafeFetch } from "@/lib/ssrf-guard";
import { detectBotChallenge } from "@/lib/bot-challenge-detector";
import { getOrgLimits } from "@/lib/tenant";
import { decrypt } from "@/lib/crypto-util";
import { decryptAuthHeaders } from "@/lib/auth-headers";
import {
  checkAPISecurity,
  checkBrokenLinks,
  checkClientSideAuthBypass,
  checkCookieSecurity,
  checkCORSMisconfiguration,
  checkDependencyExposure,
  checkDependencyVersions,
  checkExposedEndpoints,
  checkFormSecurity,
  checkInformationDisclosure,
  checkInlineScripts,
  checkMetaAndConfig,
  checkOpenRedirects,
  checkPerformanceRegression,
  checkSecurityHeaders,
  checkSSLCertExpiry,
  checkSSLIssues,
  checkThirdPartyScripts,
  checkUptimeStatus,
  scanJavaScriptForKeys,
} from "@/lib/security";
import { checkAITools } from "@/lib/ai-policy-scanner";
import { discoverEndpoints } from "@/lib/endpoint-discovery";
import { runAuthScan } from "@/lib/scanner-auth";
import { computeContentHash } from "@/lib/content-hash";
import { sendCriticalFindingsAlert } from "@/lib/alerts";
import { autoTriageFinding, verifyResolvedFindings } from "@/lib/remediation-lifecycle";
import type { SecurityFinding } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";
import { runProbe, type ProbeOutcome } from "@/lib/probe-client";

function calcStatus(findings: SecurityFinding[]) {
  if (findings.some((f) => f.severity === "CRITICAL")) return "CRITICAL" as const;
  if (findings.some((f) => f.severity === "HIGH")) return "WARNING" as const;
  return "HEALTHY" as const;
}

async function fetchJsAssets(baseUrl: string, html: string): Promise<string[]> {
  const scriptSrcs = Array.from(html.matchAll(/<script[^>]*src=["']([^"']+)["']/g)).map(
    (m) => m[1],
  );

  const payloads: string[] = [];
  for (const src of scriptSrcs.slice(0, 15)) {
    try {
      const assetUrl = new URL(src, baseUrl);
      if (!/^https?:$/.test(assetUrl.protocol)) continue;

      // Treat each JS asset as untrusted input: block private/internal URLs,
      // and keep redirect-hop SSRF protections enabled for asset fetches too.
      if (await isPrivateUrl(assetUrl.toString())) continue;

      const res = await ssrfSafeFetch(
        assetUrl.toString(),
        {
          method: "GET",
          signal: AbortSignal.timeout(10000),
        },
        3,
      );
      if (res.ok) payloads.push(await res.text());
    } catch {
      // ignore asset fetch failures
    }
  }

  return payloads;
}

/** Deduplicate findings by code + title */
function dedup(findings: SecurityFinding[]): SecurityFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.code}::${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// URL Context Classifier
//
// Different URL types warrant different security checks. Running all checks
// blindly against every URL produces false positives (e.g. rate-limit headers
// expected on homepages) and noise. The classifier determines which checks are
// relevant so the scanner is smarter and more accurate for any target site.
// ────────────────────────────────────────────────────────────────────────────

/**
 * The type of URL being scanned, used to route security checks.
 *
 * - homepage: root / index page (most common target)
 * - api-endpoint: /api/* routes; API-specific checks apply
 * - login-page: authentication pages; auth-header checks apply
 * - admin-page: admin/management areas; admin-specific hardening checks apply
 * - health-endpoint: /health, /ping, /status routes (monitoring endpoints)
 */
export type UrlContext =
  | "homepage"
  | "api-endpoint"
  | "login-page"
  | "admin-page"
  | "health-endpoint";

/**
 * Classify a URL to determine which security checks are applicable.
 *
 * Classification is path-based and generic — no hardcoded domains.
 * Paths are matched case-insensitively.
 */
export function classifyUrl(url: string): UrlContext {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return "homepage"; // Unparseable URL — treat as homepage
  }

  // Health / monitoring endpoints — checked FIRST so /api/health is a health endpoint
  // (not a generic API endpoint that would trigger unnecessary auth probing)
  if (/\/(health|ping|status|ready|live)(\/|$)/.test(pathname)) {
    return "health-endpoint";
  }

  // API endpoints: /api/*, /v1/*, /v2/*, /graphql, /rpc, etc.
  if (
    /^\/api(\/|$)/.test(pathname) ||
    /^\/v\d+(\/|$)/.test(pathname) ||
    /^\/(graphql|rpc)(\/|$)/.test(pathname)
  ) {
    return "api-endpoint";
  }

  // Login / authentication pages
  if (
    /\/(login|signin|sign-in|log-in|auth\/login|authenticate)(\/|$)/.test(pathname)
  ) {
    return "login-page";
  }

  // Admin / management pages
  if (/\/(admin|management|back-?office|staff)(\/|$)/.test(pathname)) {
    return "admin-page";
  }

  // Default: homepage or general marketing/app page
  return "homepage";
}

interface ScanContext {
  source?: "manual" | "cron" | "api";
  userId?: string;
}

export async function runHttpScanForApp(appId: string, context: ScanContext = {}) {
  const app = await db.monitoredApp.findUnique({ where: { id: appId } });
  if (!app) throw new Error("App not found");

  // Skip scan for canceled/expired orgs to avoid consuming compute
  const orgLimitsEarly = await getOrgLimits(app.orgId);
  if (orgLimitsEarly.tier === "EXPIRED" || orgLimitsEarly.status === "CANCELED") {
    await db.monitoredApp.update({
      where: { id: appId },
      data: { nextCheckAt: addHours(new Date(), 24) },
    });
    return { runId: "skipped", appId, status: "HEALTHY" as const, findingsCount: 0 };
  }

  const run = await db.monitorRun.create({
    data: {
      appId: app.id,
      status: "UNKNOWN",
      summary: "HTTP scan started",
    },
  });

  const start = Date.now();

  try {
    // SSRF guard: block private/internal URLs before fetching.
    // ssrfSafeFetch re-runs this check at every redirect hop to prevent
    // open-redirect chains that bypass a one-time pre-fetch guard.
    if (await isPrivateUrl(app.url)) {
      throw new Error("SSRF: private/internal URLs are not allowed");
    }

    const extraHeaders: Record<string, string> = {};
    if (app.authHeaders) {
      const authHdrs = decryptAuthHeaders(app.authHeaders);
      for (const h of authHdrs) {
        extraHeaders[h.name] = h.value;
      }
    }

    // Use ssrfSafeFetch (not plain fetch with redirect:"follow") so every
    // redirect hop is checked against the SSRF guard before following.
    const response = await ssrfSafeFetch(
      app.url,
      {
        method: "GET",
        headers: {
          "User-Agent": "Scantient/1.0 (Security Monitor)",
          Accept: "text/html,application/xhtml+xml",
          ...extraHeaders,
        },
        signal: AbortSignal.timeout(30000),
      },
      5, // maxRedirects
    );

    let statusCode = response.status;
    let html = await response.text();
    let headers = new Headers(response.headers);
    const botChallengeFindings: SecurityFinding[] = [];
    let collectedJsPayloads: string[] | undefined;

    // Bot challenge detection — if blocked, try probe endpoint or Playwright fallback
    const botResult = detectBotChallenge(statusCode, headers, html.slice(0, 2000));
    if (botResult.challenged) {
      let bypassSucceeded = false;

      // Probe endpoint takes priority: fetch real content server-side via secret token
      if (app.probeUrl && app.probeToken) {
        try {
          const probeRes = await fetch(app.probeUrl, {
            headers: { "x-scan-token": decrypt(app.probeToken) },
            signal: AbortSignal.timeout(20000),
          });
          if (probeRes.ok) {
            const probeData = (await probeRes.json()) as {
              html: string;
              headers: Record<string, string>;
              statusCode: number;
            };
            html = probeData.html;
            statusCode = probeData.statusCode;
            headers = new Headers(probeData.headers);
            bypassSucceeded = true;
          }
        } catch {
          // Probe fetch failed — fall through to Playwright fallback
        }
      }

      // Playwright browser scan fallback
      if (!bypassSucceeded) {
        const { runBrowserScan } = await import("@/lib/scanner-browser");
        const browserData = await runBrowserScan(app.url);
        html = browserData.html;
        statusCode = browserData.statusCode;
        headers = browserData.headers;
        collectedJsPayloads = browserData.jsPayloads;
      }

      botChallengeFindings.push({
        code: "BOT_PROTECTION_DETECTED",
        title: `Bot protection active${botResult.provider ? ` (${botResult.provider})` : ""} — browser scan used`,
        description: `This app is protected by ${botResult.provider ?? "a bot challenge system"}, which blocks standard HTTP scanners. Scantient automatically fell back to a browser-based scan to get real results. Some checks (SSL cert expiry, exposed endpoints) are still performed via HTTP.`,
        severity: "LOW",
        fixPrompt:
          "Configure a Scantient probe endpoint on this app for faster, more thorough scans without bot protection interference.",
      });
    }

    // Fetch JS assets from HTTP if not already collected by browser scan
    const jsPayloads = collectedJsPayloads ?? (await fetchJsAssets(app.url, html));

    // Content change detection — compare hash to last recorded value
    const contentHash = computeContentHash(html);
    const lastHashLog = await db.auditLog.findFirst({
      where: { orgId: app.orgId, action: "CONTENT_HASH", resource: app.id },
      orderBy: { createdAt: "desc" },
    });
    const contentHashFindings: SecurityFinding[] = [];
    if (lastHashLog?.details && lastHashLog.details !== contentHash) {
      contentHashFindings.push({
        code: "CONTENT_CHANGED",
        title: "Page content changed since last scan",
        description:
          "The visible text content of this page differs from the previous scan. Verify this change was intentional.",
        severity: "MEDIUM",
        fixPrompt:
          "Review the page content diff. If the change was unintended, check recent deployments or for unauthorised modifications.",
      });
    }
    // Store the current hash for next scan comparison
    await db.auditLog.create({
      data: {
        orgId: app.orgId,
        action: "CONTENT_HASH",
        resource: app.id,
        details: contentHash,
      },
    });

    const [sslCertFindings, brokenLinkFindings, exposedEndpointFindings] = await Promise.all([
      checkSSLCertExpiry(app.url),
      checkBrokenLinks(html, app.url),
      checkExposedEndpoints(app.url),
    ]);

    const responseTimeMsSnapshot = Date.now() - start;
    const perfRegressionFindings = await checkPerformanceRegression(app.id, responseTimeMsSnapshot);

    // Classify the target URL so we can route checks intelligently.
    // Checks that only make sense for specific URL types are gated here.
    // This prevents false positives (e.g. rate-limit headers on homepages)
    // and noise from running irrelevant checks against every URL.
    const urlContext = classifyUrl(app.url);

    const rawFindings: SecurityFinding[] = [
      ...botChallengeFindings,
      // ── Checks applicable to ALL URL types ──────────────────────────────
      ...checkSecurityHeaders(headers),
      ...scanJavaScriptForKeys(jsPayloads),
      ...checkClientSideAuthBypass(html),
      ...checkInlineScripts(html),
      ...checkMetaAndConfig(html, headers),
      ...checkCookieSecurity(headers),
      ...checkCORSMisconfiguration(headers),
      ...checkInformationDisclosure(html, headers),
      ...checkSSLIssues(html, headers, app.url),
      ...checkDependencyExposure(html),
      ...checkOpenRedirects(html),
      ...checkThirdPartyScripts(html, app.url),
      ...checkFormSecurity(html, app.url),
      ...checkDependencyVersions(jsPayloads),
      ...sslCertFindings,
      ...brokenLinkFindings,
      // ── API-endpoint-only checks ─────────────────────────────────────────
      // Rate-limit headers, GraphQL introspection, API docs exposure, etc.
      // Only meaningful on /api/*, /v1/*, /graphql routes.
      ...(urlContext === "api-endpoint" ? checkAPISecurity(html, headers, app.url) : []),
      // ── Future: login-page-only checks ──────────────────────────────────
      // checkAuthHeaders() — when implemented, only run for login-page context
      // ── Future: admin-page-only checks ──────────────────────────────────
      // checkAdminSecurity() — when implemented, only run for admin-page context
      ...exposedEndpointFindings,
      ...perfRegressionFindings,
      ...checkUptimeStatus(statusCode, responseTimeMsSnapshot),
      ...contentHashFindings,
      ...checkAITools(html, headers, jsPayloads),
    ];

    // Tier 1: Discover and scan auth surface
    // Wrapped in try/catch — auth scan failure never breaks the main scan
    let discoveredEndpointCount = 0;
    try {
      const endpoints = await discoverEndpoints(html, jsPayloads, app.url);
      discoveredEndpointCount = endpoints.length;
      if (endpoints.length > 0) {
        const authFindings = await runAuthScan(endpoints, app.url, html, jsPayloads);
        rawFindings.push(...authFindings);
      }
    } catch (authScanErr) {
      console.warn(
        "[auth-scan] Tier 1 auth surface scan failed (non-fatal):",
        authScanErr instanceof Error ? authScanErr.message : authScanErr,
      );
    }

    const findings = dedup(rawFindings);
    const responseTimeMs = Date.now() - start;
    const status = calcStatus(findings);

    // ── Tier 2: Subsystem Health Probe ──────────────────────────────────────
    // After the main security scan, if the app has a probeUrl + probeToken
    // configured, call the target app's /api/scantient-probe endpoint to get
    // structured subsystem health data (database, auth, payments, email, etc.).
    // This runs independently of the main scan — failure never blocks the run.
    // Note: app.probeUrl/probeToken are ALSO used above for the bot-challenge
    // bypass (HTML fetch). Here we use them for the distinct Tier 2 health probe.
    let probeOutcome: ProbeOutcome | null = null;
    if (app.probeUrl && app.probeToken) {
      try {
        const decryptedToken = decrypt(app.probeToken);
        probeOutcome = await runProbe(app.probeUrl, decryptedToken);
      } catch (probeErr) {
        console.warn(
          "[tier2-probe] Probe failed (non-fatal):",
          probeErr instanceof Error ? probeErr.message : probeErr,
        );
      }
    }
    // ── End Tier 2 ──────────────────────────────────────────────────────────

    // Determine scan interval before the transaction (no DB write needed)
    const orgLimits = await getOrgLimits(app.orgId);
    const scanIntervalHours: Record<string, number> = {
      ENTERPRISE: 1,
      ENTERPRISE_PLUS: 1,
      PRO: 4,
      STARTER: 8,
      FREE: 24,
      EXPIRED: 24,
    };
    const intervalHours = scanIntervalHours[orgLimits.tier] ?? 24;

    // Atomically write the completed run and the updated app status/timing.
    // If either write fails the entire scan completion rolls back — preventing
    // a state where the run shows CRITICAL but the app still shows HEALTHY.
    // Note: findings are upserted AFTER this transaction (see below) so that
    // per-finding DB errors don't roll back the whole run record.
    const completedAt = new Date();
    await db.$transaction(async (tx) => {
      await tx.monitorRun.update({
        where: { id: run.id },
        data: {
          status,
          responseTimeMs,
          // checksRun: record the actual number of de-duplicated findings
          checksRun: findings.length,
          summary: findings.length
            ? `${findings.length} issue(s) detected`
            : "All checks passed — no issues detected",
          completedAt,
          discoveredEndpointCount,
          // Tier 2: store probe result if one was obtained
          ...(probeOutcome !== null ? { probeResult: probeOutcome as object } : {}),
        },
      });

      // Calculate rolling uptime % and avg response ms from last 30 runs
      // (query runs inside the transaction for consistent read)
      const recentRuns = await tx.monitorRun.findMany({
        where: { appId: app.id },
        orderBy: { startedAt: "desc" },
        take: 30,
        select: { status: true, responseTimeMs: true },
      });

      let uptimePercent: number | undefined;
      let avgResponseMs: number | undefined;

      if (recentRuns.length > 0) {
        const upRuns = recentRuns.filter((r) => r.status !== "CRITICAL");
        uptimePercent = (upRuns.length / recentRuns.length) * 100;

        const runsWithResponse = recentRuns.filter((r) => r.responseTimeMs != null);
        if (runsWithResponse.length > 0) {
          const totalMs = runsWithResponse.reduce((sum, r) => sum + (r.responseTimeMs ?? 0), 0);
          avgResponseMs = Math.round(totalMs / runsWithResponse.length);
        }
      }

      await tx.monitoredApp.update({
        where: { id: app.id },
        data: {
          status,
          lastCheckedAt: completedAt,
          nextCheckAt: addHours(completedAt, intervalHours),
          ...(uptimePercent !== undefined ? { uptimePercent } : {}),
          ...(avgResponseMs !== undefined ? { avgResponseMs } : {}),
        },
      });
    });

    // Upsert findings by (appId, code) — prevents duplicate DB rows on repeated
    // scans of the same issue. Each upsert updates runId to the current run so
    // that findings stay linked to the most recent detection, and resets status
    // to OPEN so that previously-resolved findings are re-surfaced if they recur.
    // Runs outside the transaction — individual upsert failures are non-fatal.
    await Promise.all(
      findings.map((f) =>
        db.finding.upsert({
          where: { appId_code: { appId: app.id, code: f.code } },
          create: {
            appId: app.id,
            runId: run.id,
            code: f.code,
            title: f.title,
            description: f.description,
            severity: f.severity,
            fixPrompt: f.fixPrompt,
            status: "OPEN",
          },
          update: {
            runId: run.id,
            title: f.title,
            description: f.description,
            severity: f.severity,
            fixPrompt: f.fixPrompt,
            status: "OPEN",
          },
        }),
      ),
    );

    // Auto-triage new findings in parallel (was sequential N+1 loop)
    // Runs outside the transaction — failures are non-fatal (triage is best-effort)
    const updatedRun = await db.monitorRun.findUnique({
      where: { id: run.id },
      include: { findings: { select: { id: true } } },
    });
    if (updatedRun && updatedRun.findings.length > 0) {
      await Promise.all(updatedRun.findings.map((f) => autoTriageFinding(f.id)));
    }

    const newFindingCodes = new Set(findings.map((f) => f.code));
    await verifyResolvedFindings(app.id, newFindingCodes);

    await sendCriticalFindingsAlert(app.id, findings);

    await trackEvent({
      event: "scan_completed",
      orgId: app.orgId,
      userId: context.userId,
      properties: {
        appId: app.id,
        source: context.source ?? "cron",
        status,
        findingsCount: findings.length,
        responseTimeMs,
      },
    });

    return { runId: run.id, appId: app.id, status, findingsCount: findings.length, responseTimeMs };
  } catch (error) {
    const elapsed = Date.now() - start;

    await db.monitorRun.update({
      where: { id: run.id },
      data: {
        status: "CRITICAL",
        responseTimeMs: elapsed,
        summary: error instanceof Error ? error.message : "Unknown scan error",
        completedAt: new Date(),
      },
    });

    await db.monitoredApp.update({
      where: { id: app.id },
      data: {
        status: "CRITICAL",
        lastCheckedAt: new Date(),
        nextCheckAt: addHours(new Date(), 1),
      },
    });

    await trackEvent({
      event: "scan_completed",
      orgId: app.orgId,
      userId: context.userId,
      properties: {
        appId: app.id,
        source: context.source ?? "cron",
        status: "CRITICAL",
        error: error instanceof Error ? error.message : "unknown",
        responseTimeMs: elapsed,
      },
    });

    throw error;
  }
}

export async function runDueHttpScans(limit = 20) {
  const deadline = Date.now() + 55_000; // 55s total timeout (5s buffer for Vercel 60s limit)

  // Atomic claim: findMany + updateMany inside a single serializable transaction
  // prevents the TOCTOU race where two concurrent cron invocations both read
  // the same due apps before either has bumped nextCheckAt.
  const dueApps = await db.$transaction(async (tx) => {
    const apps = await tx.monitoredApp.findMany({
      where: {
        OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: new Date() } }],
      },
      take: limit,
      orderBy: [{ nextCheckAt: "asc" }],
    });

    if (apps.length === 0) return [];

    // Claim the selected apps immediately by bumping nextCheckAt 1 hour into
    // the future within the same transaction — concurrent invocations will
    // block on the row locks and see the updated values on retry.
    await tx.monitoredApp.updateMany({
      where: { id: { in: apps.map((a) => a.id) } },
      data: { nextCheckAt: addHours(new Date(), 1) },
    });

    return apps;
  });

  if (dueApps.length === 0) return [];

  const results: Array<{ orgId: string; appId: string; status: string; findingsCount?: number; error?: string }> =
    [];

  const CONCURRENCY = 5;

  for (let i = 0; i < dueApps.length; i += CONCURRENCY) {
    if (Date.now() >= deadline) {
      const skipped = dueApps.slice(i).map((a) => a.id);
      console.log(`[cron] Timeout reached. Skipping ${skipped.length} apps: ${skipped.join(", ")}`);
      break;
    }

    const batch = dueApps.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((app) => runHttpScanForApp(app.id, { source: "cron" })),
    );

    for (let j = 0; j < batch.length; j++) {
      const settled = batchResults[j];
      if (settled.status === "fulfilled") {
        results.push({
          orgId: batch[j].orgId,
          appId: batch[j].id,
          status: settled.value.status,
          findingsCount: settled.value.findingsCount,
        });
      } else {
        const err = settled.reason;
        results.push({
          orgId: batch[j].orgId,
          appId: batch[j].id,
          status: "CRITICAL",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return results;
}
