import { addHours } from "date-fns";
import { db } from "@/lib/db";
import {
  checkClientSideAuthBypass,
  checkSecurityHeaders,
  scanJavaScriptForKeys,
} from "@/lib/security";
import { sendCriticalFindingsAlert } from "@/lib/alerts";
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
  for (const src of scriptSrcs.slice(0, 10)) {
    const assetUrl = src.startsWith("http") ? src : new URL(src, baseUrl).toString();
    try {
      const res = await fetch(assetUrl, { method: "GET" });
      if (res.ok) payloads.push(await res.text());
    } catch {
      // ignore asset fetch failures
    }
  }

  return payloads;
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
    });

    const html = await response.text();
    const jsPayloads = await fetchJsAssets(app.url, html);

    const findings = [
      ...checkSecurityHeaders(new Headers(response.headers)),
      ...scanJavaScriptForKeys(jsPayloads),
      ...checkClientSideAuthBypass(html),
    ];

    const responseTimeMs = Date.now() - start;
    const status = calcStatus(findings);

    await db.monitorRun.update({
      where: { id: run.id },
      data: {
        status,
        responseTimeMs,
        summary: findings.length
          ? `${findings.length} issue(s) detected`
          : "No critical issues detected",
        completedAt: new Date(),
        findings: {
          create: findings,
        },
      },
    });

    await sendCriticalFindingsAlert(app.id, findings);

    await db.monitoredApp.update({
      where: { id: app.id },
      data: {
        status,
        lastCheckedAt: new Date(),
        nextCheckAt: addHours(new Date(), 4),
      },
    });

    return { appId: app.id, status, findingsCount: findings.length };
  } catch (error) {
    await db.monitorRun.update({
      where: { id: run.id },
      data: {
        status: "CRITICAL",
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
  const dueApps = await db.monitoredApp.findMany({
    where: {
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: new Date() } }],
    },
    take: limit,
    orderBy: [{ nextCheckAt: "asc" }],
  });

  const results: Array<{ appId: string; status: string; error?: string }> = [];

  for (const app of dueApps) {
    try {
      const result = await runHttpScanForApp(app.id);
      results.push({ appId: app.id, status: result.status });
    } catch (error) {
      results.push({
        appId: app.id,
        status: "CRITICAL",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
