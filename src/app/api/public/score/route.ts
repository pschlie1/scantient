import { NextResponse } from "next/server";
import { z } from "zod";
import {
  checkSecurityHeaders,
  checkMetaAndConfig,
  checkSSLIssues,
  checkInlineScripts,
  checkCORSMisconfiguration,
} from "@/lib/security";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isPrivateUrl } from "@/lib/ssrf-guard";
import type { SecurityFinding } from "@/lib/types";
import { applyCors, corsPreflightResponse, CORS_HEADERS_PUBLIC } from "@/lib/cors";

export function OPTIONS() {
  return corsPreflightResponse(CORS_HEADERS_PUBLIC);
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

async function handler(req: Request): Promise<NextResponse> {
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

  // SSRF guard: block private and internal addresses
  if (await isPrivateUrl(url)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  // Fetch the URL with 30s timeout
  let html = "";
  let headers: Headers = new Headers();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Scantient-Scanner/1.0 (Security Check)",
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
        upgradeUrl: "https://scantient.com/signup",
        message:
          "Full scan available with a Scantient account: monitors 10x more attack vectors",
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
    upgradeUrl: "https://scantient.com/signup",
    message:
      "Full scan available with a Scantient account: monitors 10x more attack vectors",
  });
}

export async function POST(req: Request) {
  return applyCors(await handler(req), CORS_HEADERS_PUBLIC);
}
