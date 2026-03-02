import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { applyCors, corsPreflightResponse, CORS_HEADERS_PUBLIC } from "@/lib/cors";
import { escapeSvg } from "@/lib/security";

export function OPTIONS() {
  return corsPreflightResponse(CORS_HEADERS_PUBLIC);
}

export function calcScore(findings: { severity: string }[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.severity === "CRITICAL") score -= 25;
    else if (f.severity === "HIGH") score -= 10;
    else if (f.severity === "MEDIUM") score -= 5;
    else score -= 1;
  }
  return Math.max(0, score);
}

export function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function scoreToColor(score: number): string {
  if (score >= 80) return "#4c1";
  if (score >= 50) return "#dfb317";
  return "#e05d44";
}

export function makeBadgeSvg(score: number, grade: string): string {
  const label = "Scantient";
  const value = `${score} ${grade}`;
  // Escape user-influenced strings for safe XML/SVG embedding.
  // grade and value are computed values but we escape defensively so that any
  // future caller passing user-controlled strings cannot inject XML.
  const safeLabel = escapeSvg(label);
  const safeValue = escapeSvg(value);
  const color = scoreToColor(score);
  const labelWidth = label.length * 7 + 10;
  const valueWidth = value.length * 7 + 14;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${safeLabel}</text>
    <text x="${labelWidth / 2}" y="14">${safeLabel}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${safeValue}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${safeValue}</text>
  </g>
</svg>`;
}

function makeFallbackSvg(message: string): string {
  return makeBadgeSvg(0, message.slice(0, 5));
}

async function handler(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const format = searchParams.get("format") ?? "svg";

  const svgHeaders = {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };
  const jsonHeaders = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  // Prefer Authorization: Bearer <key> header; fall back to ?key= query param
  let key: string | null = null;
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    key = authHeader.slice(7).trim();
  } else {
    const keyParam = searchParams.get("key");
    if (keyParam) {
      console.warn("[badge] Deprecated: API key passed as ?key= query param. Use Authorization: Bearer <key> header instead.");
      key = keyParam;
    }
  }

  if (!url || !key) {
    if (format === "json") {
      return NextResponse.json({ error: "Missing url or key" }, { status: 400 });
    }
    if (format === "shield") {
      return NextResponse.json({ schemaVersion: 1, label: "Scantient", message: "unknown", color: "grey" }, { headers: jsonHeaders });
    }
    return new NextResponse(makeFallbackSvg("?"), { headers: svgHeaders });
  }

  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const apiKey = await db.apiKey.findFirst({ where: { keyHash: hash } });
  if (!apiKey || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
    if (format === "json") {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    if (format === "shield") {
      return NextResponse.json({ schemaVersion: 1, label: "Scantient", message: "invalid key", color: "red" }, { headers: jsonHeaders });
    }
    return new NextResponse(makeFallbackSvg("err"), { headers: svgHeaders });
  }

  const app = await db.monitoredApp.findFirst({
    where: { url, orgId: apiKey.orgId },
    include: {
      monitorRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: { findings: { select: { severity: true } } },
      },
    },
  });

  if (!app || app.monitorRuns.length === 0) {
    if (format === "json") {
      return NextResponse.json({ error: "No scan data found" }, { status: 404 });
    }
    if (format === "shield") {
      return NextResponse.json({ schemaVersion: 1, label: "Scantient", message: "no data", color: "grey" }, { headers: jsonHeaders });
    }
    return new NextResponse(makeFallbackSvg("n/a"), { headers: svgHeaders });
  }

  const findings = app.monitorRuns[0].findings;
  const score = calcScore(findings);
  const grade = scoreToGrade(score);
  const color = scoreToColor(score);

  if (format === "json") {
    return NextResponse.json({
      score,
      grade,
      color,
      status: score >= 80 ? "healthy" : score >= 50 ? "warning" : "critical",
      findingsCount: findings.length,
      url: app.url,
      lastScannedAt: app.monitorRuns[0]?.startedAt ?? null,
    }, { headers: jsonHeaders });
  }

  if (format === "shield") {
    // shields.io endpoint format
    const shieldColor = score >= 80 ? "brightgreen" : score >= 50 ? "yellow" : "red";
    return NextResponse.json(
      {
        schemaVersion: 1,
        label: "Scantient",
        message: `${score} ${grade}`,
        color: shieldColor,
        namedLogo: "security",
      },
      { headers: jsonHeaders },
    );
  }

  // Default: SVG
  return new NextResponse(makeBadgeSvg(score, grade), { headers: svgHeaders });
}

export async function GET(req: Request) {
  return applyCors(await handler(req), CORS_HEADERS_PUBLIC);
}
