import { NextResponse } from "next/server";
import { z } from "zod";
import { lookup } from "dns/promises";
import { isIP } from "net";
import {
  checkSecurityHeaders,
  checkMetaAndConfig,
  checkSSLIssues,
  checkInlineScripts,
  checkCORSMisconfiguration,
} from "@/lib/security";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { SecurityFinding } from "@/lib/types";

/**
 * SSRF guard — returns true if the URL resolves to a private/internal IP.
 */
async function isPrivateUrl(url: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return true;
  }
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;
  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) return isPrivateIp(hostname);
  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.some((a) => isPrivateIp(a.address));
  } catch {
    return true;
  }
}

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const v4 = v4mapped ? v4mapped[1] : ip;
  const parts = v4.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

const requestSchema = z.object({
  url: z.string().url("Must be a valid URL"),
});

const SEVERITY_DEDUCTION: Record<string, number> = {
  CRITICAL: 25,
  HIGH: 15,
  MEDIUM: 5,
  LOW: 2,
};

function computeGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

function computeStatus(score: number): "healthy" | "warning" | "critical" {
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

export async function POST(req: Request) {
  // Rate limiting: 10 requests per hour per IP
  const ip = getClientIp(req);
  const rateResult = await checkRateLimit(`public-score:${ip}`, {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  });

  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later.", retryAfterSeconds: rateResult.retryAfterSeconds },
      {
        status: 429,
        headers: rateResult.retryAfterSeconds
          ? { "Retry-After": String(rateResult.retryAfterSeconds) }
          : {},
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { url } = parsed.data;

  // SSRF guard: block private/internal URLs before fetching
  if (await isPrivateUrl(url)) {
    return NextResponse.json(
      { error: "SSRF: private/internal URLs are not allowed" },
      { status: 400 },
    );
  }

  // Fetch the URL with 30s timeout
  let html = "";
  let headers: Headers = new Headers();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "VibeSafe-Scanner/1.0 (Security Check)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    html = await response.text();
    headers = response.headers;
  } catch {
    return NextResponse.json(
      {
        url,
        score: 0,
        grade: "F",
        status: "critical",
        findingsCount: 0,
        criticalCount: 0,
        highCount: 0,
        findings: [],
        scannedAt: new Date().toISOString(),
        upgradeUrl: "https://vibesafe-two.vercel.app/signup",
        message:
          "Full scan available with VibeSafe account — monitors 10x more attack vectors",
        error: "Could not reach URL",
      },
      { status: 200 },
    );
  }

  // Run lite checks (sync only — fast)
  const allFindings: SecurityFinding[] = [
    ...checkSecurityHeaders(headers),
    ...checkMetaAndConfig(html, headers),
    ...checkSSLIssues(html, headers, url),
    ...checkInlineScripts(html),
    ...checkCORSMisconfiguration(headers),
  ];

  // Deduplicate by code+title
  const seen = new Set<string>();
  const findings = allFindings.filter((f) => {
    const key = `${f.code}::${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Compute score
  const deduction = findings.reduce(
    (sum, f) => sum + (SEVERITY_DEDUCTION[f.severity] ?? 0),
    0,
  );
  const score = Math.max(0, 100 - deduction);
  const grade = computeGrade(score);
  const status = computeStatus(score);

  const criticalCount = findings.filter((f) => f.severity === "CRITICAL").length;
  const highCount = findings.filter((f) => f.severity === "HIGH").length;

  // Sort by severity for display, return top 5
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const topFindings = [...findings]
    .sort(
      (a, b) =>
        (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
    )
    .slice(0, 5)
    .map((f) => ({
      severity: f.severity,
      title: f.title,
      description: f.description,
    }));

  return NextResponse.json({
    url,
    score,
    grade,
    status,
    findingsCount: findings.length,
    criticalCount,
    highCount,
    findings: topFindings,
    scannedAt: new Date().toISOString(),
    upgradeUrl: "https://vibesafe-two.vercel.app/signup",
    message:
      "Full scan available with VibeSafe account — monitors 10x more attack vectors",
  });
}
