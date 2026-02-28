import { chromium } from "playwright";
import { addHours } from "date-fns";
import { db } from "@/lib/db";
import { sendCriticalFindingsAlert, sendChangeDetectedAlert } from "@/lib/alerts";
import {
  checkClientSideAuthBypass,
  checkSecurityHeaders,
  scanJavaScriptForKeys,
} from "@/lib/security";
import { computeContentHash, detectChange, embedHashInSummary } from "@/lib/change-detector";
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
      // ignore asset fetch failures for now
    }
  }

  return payloads;
}

export async function runMonitorForApp(appId: string) {
  const app = await db.monitoredApp.findUnique({ where: { id: appId } });
  if (!app) throw new Error("App not found");

  const run = await db.monitorRun.create({
    data: {
      appId: app.id,
      status: "UNKNOWN",
      summary: "Scan started",
    },
  });

  const start = Date.now();
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const response = await page.goto(app.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const html = await page.content();
    const jsPayloads = await fetchJsAssets(app.url, html);

    const findings = [
      ...(response ? checkSecurityHeaders(new Headers(response.headers())) : []),
      ...scanJavaScriptForKeys(jsPayloads),
      ...checkClientSideAuthBypass(html),
    ];

    const responseTimeMs = Date.now() - start;
    const status = calcStatus(findings);

    // Change detection: hash HTML + security headers
    const responseHeaders: Record<string, string> = {};
    if (response) {
      for (const [k, v] of Object.entries(response.headers())) {
        responseHeaders[k.toLowerCase()] = v;
      }
    }
    const contentHash = computeContentHash(html, responseHeaders);
    const { changed } = await detectChange(app.id, contentHash);

    const baseSummary = findings.length
      ? `${findings.length} issue(s) detected`
      : "No critical issues detected";

    await db.monitorRun.update({
      where: { id: run.id },
      data: {
        status,
        responseTimeMs,
        summary: embedHashInSummary(contentHash, changed ? `⚡ Content changed. ${baseSummary}` : baseSummary),
        completedAt: new Date(),
        findings: {
          create: findings,
        },
      },
    });

    // Send alerts
    if (changed) {
      await sendChangeDetectedAlert(app.id, app.name, app.url);
    }
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
  } finally {
    await browser.close();
  }
}

export async function runDueMonitors(limit = 20) {
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
      const result = await runMonitorForApp(app.id);
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
