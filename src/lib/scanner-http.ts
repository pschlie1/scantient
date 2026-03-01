import { addHours } from "date-fns";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { db } from "@/lib/db";
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

/**
 * SSRF guard — returns true if the URL resolves to a private/internal IP.
 * Blocks: 10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1, localhost
 */
async function isPrivateUrl(url: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return true; // invalid URL → treat as private
  }

  // Block localhost by name
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;

  // If it's already an IP literal, check directly
  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) {
    return isPrivateIp(hostname);
  }

  // Resolve hostname and check all addresses
  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.some((a) => isPrivateIp(a.address));
  } catch {
    return true; // DNS failure → treat as private for safety
  }
}

function isPrivateIp(ip: string): boolean {
  // IPv6 loopback
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  // IPv4-mapped IPv6
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const v4 = v4mapped ? v4mapped[1] : ip;
  const parts = v4.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return (
    a === 127 || // 127.0.0.0/8
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) // 169.254.0.0/16 (link-local)
  );
}

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
    const assetUrl = src.startsWith("http") ? src : new URL(src, baseUrl).toString();
    try {
      const res = await fetch(assetUrl, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });
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

  const run = await db.monitorRun.create({
    data: {
      appId: app.id,
      status: "UNKNOWN",
      summary: "HTTP scan started",
    },
  });

  const start = Date.now();

  try {
    // SSRF guard: block private/internal URLs before fetching
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

    const response = await fetch(app.url, {
      method: "GET",
      headers: {
        "User-Agent": "Scantient/1.0 (Security Monitor)",
        Accept: "text/html,application/xhtml+xml",
        ...extraHeaders,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });

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

    await db.monitorRun.update({
      where: { id: run.id },
      data: {
        status,
        responseTimeMs,
        summary: findings.length
          ? `${findings.length} issue(s) detected`
          : "All checks passed — no issues detected",
        completedAt: new Date(),
        findings: {
          create: findings,
        },
      },
    });

    // Auto-triage new findings & verify resolved ones
    const updatedRun = await db.monitorRun.findUnique({
      where: { id: run.id },
      include: { findings: { select: { id: true } } },
    });
    if (updatedRun) {
      for (const f of updatedRun.findings) {
        await autoTriageFinding(f.id);
      }
    }

    const newFindingCodes = new Set(findings.map((f) => f.code));
    await verifyResolvedFindings(app.id, newFindingCodes);

    await sendCriticalFindingsAlert(app.id, findings);

    // Determine scan interval based on org tier
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

    // Calculate rolling uptime % and avg response ms from last 30 runs
    const recentRuns = await db.monitorRun.findMany({
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

    await db.monitoredApp.update({
      where: { id: app.id },
      data: {
        status,
        lastCheckedAt: new Date(),
        nextCheckAt: addHours(new Date(), intervalHours),
        ...(uptimePercent !== undefined ? { uptimePercent } : {}),
        ...(avgResponseMs !== undefined ? { avgResponseMs } : {}),
      },
    });

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

  const dueApps = await db.monitoredApp.findMany({
    where: {
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: new Date() } }],
    },
    take: limit,
    orderBy: [{ nextCheckAt: "asc" }],
  });

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
