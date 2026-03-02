import { addHours } from "date-fns";
import { db } from "@/lib/db";
import { isPrivateUrl, ssrfSafeFetch } from "@/lib/ssrf-guard";
import { getOrgLimits } from "@/lib/tenant";
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
import { computeContentHash } from "@/lib/content-hash";
import { sendCriticalFindingsAlert } from "@/lib/alerts";
import { autoTriageFinding, verifyResolvedFindings } from "@/lib/remediation-lifecycle";
import type { SecurityFinding } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";

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

    const statusCode = response.status;
    const html = await response.text();
    const headers = new Headers(response.headers);
    const jsPayloads = await fetchJsAssets(app.url, html);

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

    const rawFindings: SecurityFinding[] = [
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
      ...checkAPISecurity(html, headers),
      ...checkOpenRedirects(html),
      ...checkThirdPartyScripts(html, app.url),
      ...checkFormSecurity(html),
      ...checkDependencyVersions(jsPayloads),
      ...sslCertFindings,
      ...brokenLinkFindings,
      ...exposedEndpointFindings,
      ...perfRegressionFindings,
      ...checkUptimeStatus(statusCode, responseTimeMsSnapshot),
      ...contentHashFindings,
    ];

    const findings = dedup(rawFindings);
    const responseTimeMs = Date.now() - start;
    const status = calcStatus(findings);

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

    // Atomically write the completed run (with findings) and the updated app
    // status/timing. If either write fails the entire scan completion rolls back
    // — preventing a state where the run shows CRITICAL but the app still shows
    // HEALTHY (or vice versa).
    const completedAt = new Date();
    await db.$transaction(async (tx) => {
      await tx.monitorRun.update({
        where: { id: run.id },
        data: {
          status,
          responseTimeMs,
          // checksRun: record the actual number of findings evaluated
          checksRun: findings.length,
          summary: findings.length
            ? `${findings.length} issue(s) detected`
            : "All checks passed — no issues detected",
          completedAt,
          findings: {
            create: findings,
          },
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
