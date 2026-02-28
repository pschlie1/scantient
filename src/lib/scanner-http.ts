import { addHours } from "date-fns";
import { db } from "@/lib/db";
import { getOrgLimits } from "@/lib/tenant";
import {
  checkClientSideAuthBypass,
  checkInlineScripts,
  checkMetaAndConfig,
  checkSecurityHeaders,
  scanJavaScriptForKeys,
} from "@/lib/security";
import { sendCriticalFindingsAlert } from "@/lib/alerts";
import { autoTriageFinding, verifyResolvedFindings } from "@/lib/remediation-lifecycle";
import type { SecurityFinding } from "@/lib/types";

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

export async function runHttpScanForApp(appId: string) {
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
    const response = await fetch(app.url, {
      method: "GET",
      headers: {
        "User-Agent": "VibeSafe/1.0 (Security Monitor)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });

    const html = await response.text();
    const headers = new Headers(response.headers);
    const jsPayloads = await fetchJsAssets(app.url, html);

    const rawFindings: SecurityFinding[] = [
      ...checkSecurityHeaders(headers),
      ...scanJavaScriptForKeys(jsPayloads),
      ...checkClientSideAuthBypass(html),
      ...checkInlineScripts(html),
      ...checkMetaAndConfig(html, headers),
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

    await sendCriticalFindingsAlert(app.id, findings);

    // Determine scan interval based on org tier
    const orgLimits = await getOrgLimits(app.orgId);
    const scanIntervalHours: Record<string, number> = {
      ENTERPRISE: 1,
      PRO: 4,
      STARTER: 8,
      FREE: 24,
      EXPIRED: 24,
    };
    const intervalHours = scanIntervalHours[orgLimits.tier] ?? 24;

    await db.monitoredApp.update({
      where: { id: app.id },
      data: {
        status,
        lastCheckedAt: new Date(),
        nextCheckAt: addHours(new Date(), intervalHours),
      },
    });

    return { appId: app.id, status, findingsCount: findings.length, responseTimeMs };
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

  const results: Array<{ appId: string; status: string; findingsCount?: number; error?: string }> =
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
      batch.map((app) => runHttpScanForApp(app.id)),
    );

    for (let j = 0; j < batch.length; j++) {
      const settled = batchResults[j];
      if (settled.status === "fulfilled") {
        results.push({
          appId: batch[j].id,
          status: settled.value.status,
          findingsCount: settled.value.findingsCount,
        });
      } else {
        const err = settled.reason;
        results.push({
          appId: batch[j].id,
          status: "CRITICAL",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return results;
}
