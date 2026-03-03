/**
 * Browser-based scanner fallback using Playwright.
 * Used when HTTP scan is blocked by bot protection.
 */
import type { SecurityFinding } from "@/lib/types";
import type { BotProvider } from "@/lib/bot-challenge-detector";
import {
  checkSecurityHeaders,
  checkInlineScripts,
  checkCORSMisconfiguration,
  checkSSLIssues,
  checkFormSecurity,
  checkThirdPartyScripts,
  checkInformationDisclosure,
  checkMetaAndConfig,
  scanJavaScriptForKeys,
  checkClientSideAuthBypass,
  checkDependencyExposure,
  checkAPISecurity,
  checkOpenRedirects,
} from "@/lib/security";

export interface BrowserScanResult {
  html: string;
  headers: Headers;
  statusCode: number;
  responseTimeMs: number;
  jsPayloads: string[];
}

export async function runBrowserScan(url: string): Promise<BrowserScanResult> {
  // Dynamic import — Playwright only available in Node env, not edge
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const start = Date.now();

  try {
    const context = await browser.newContext({
      userAgent: "Scantient-Scanner/1.0 (Security Monitor; https://scantient.com)",
    });
    const page = await context.newPage();

    const capturedHeaders: Record<string, string> = {};
    let statusCode = 200;

    page.on("response", async (response) => {
      if (response.url() === url || response.url() === url + "/") {
        statusCode = response.status();
        const hdrs = response.headers();
        Object.assign(capturedHeaders, hdrs);
      }
    });

    const jsPayloads: string[] = [];
    page.on("response", async (response) => {
      const ct = response.headers()["content-type"] ?? "";
      if (ct.includes("javascript")) {
        try {
          jsPayloads.push(await response.text());
        } catch {
          // ignore asset fetch failures
        }
      }
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const html = await page.content();
    const responseTimeMs = Date.now() - start;

    const headers = new Headers(capturedHeaders);

    return { html, headers, statusCode, responseTimeMs, jsPayloads };
  } finally {
    await browser.close();
  }
}

export async function runBrowserScanFindings(
  url: string,
  botProvider: BotProvider | null,
): Promise<{ findings: SecurityFinding[]; responseTimeMs: number; statusCode: number }> {
  const { html, headers, statusCode, responseTimeMs, jsPayloads } = await runBrowserScan(url);

  // Add a finding noting bot protection was detected and browser scan was used
  const botFinding: SecurityFinding = {
    code: "BOT_PROTECTION_DETECTED",
    title: `Bot protection active${botProvider ? ` (${botProvider})` : ""} — browser scan used`,
    description: `This app is protected by ${botProvider ?? "a bot challenge system"}, which blocks standard HTTP scanners. Scantient automatically used a browser-based scan to get real results. Some checks (SSL cert expiry, DNS, exposed endpoints) are still performed via HTTP.`,
    severity: "LOW",
    fixPrompt:
      "Consider adding a Scantient probe endpoint (see docs) to enable faster, more thorough headless scans without bot protection interference.",
  };

  const rawFindings: SecurityFinding[] = [
    botFinding,
    ...checkSecurityHeaders(headers),
    ...scanJavaScriptForKeys(jsPayloads),
    ...checkClientSideAuthBypass(html),
    ...checkInlineScripts(html),
    ...checkMetaAndConfig(html, headers),
    ...checkCORSMisconfiguration(headers),
    ...checkInformationDisclosure(html, headers),
    ...checkSSLIssues(html, headers, url),
    ...checkDependencyExposure(html),
    ...checkAPISecurity(html, headers, url),
    ...checkOpenRedirects(html),
    ...checkThirdPartyScripts(html, url),
    ...checkFormSecurity(html, url),
  ];

  const seen = new Set<string>();
  const findings = rawFindings.filter((f) => {
    const key = `${f.code}::${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { findings, responseTimeMs, statusCode };
}
