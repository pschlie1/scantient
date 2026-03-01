import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";

function makeSvg(label: string, value: string, color: string): string {
  const labelWidth = label.length * 7 + 10;
  const valueWidth = value.length * 7 + 10;
  const totalWidth = labelWidth + valueWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20"><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#555"/><rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/><rect width="${totalWidth}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11"><text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text><text x="${labelWidth / 2}" y="14">${label}</text><text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text><text x="${labelWidth + valueWidth / 2}" y="14">${value}</text></g></svg>`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const svgHeaders = { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache, no-store, must-revalidate" };

  // Prefer Authorization: Bearer <key> header; fall back to ?key= query param (deprecated)
  let key: string | null = null;
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    key = authHeader.slice(7).trim();
  } else {
    const keyParam = searchParams.get("key");
    if (keyParam) {
      // Deprecated: log a warning and accept for backward compatibility
      console.warn("[badge] Deprecated: API key passed as ?key= query param. Use Authorization: Bearer <key> header instead.");
      key = keyParam;
    }
  }

  if (!url || !key) return new NextResponse(makeSvg("scantient", "unknown", "#9f9f9f"), { headers: svgHeaders });


  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const apiKey = await db.apiKey.findFirst({ where: { keyHash: hash } });
  if (!apiKey || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
    return new NextResponse(makeSvg("scantient", "invalid key", "#e05d44"), { headers: svgHeaders });
  }

  const app = await db.monitoredApp.findFirst({
    where: { url, orgId: apiKey.orgId },
    include: { monitorRuns: { orderBy: { startedAt: "desc" }, take: 1, include: { findings: { select: { severity: true } } } } },
  });
  if (!app || app.monitorRuns.length === 0) return new NextResponse(makeSvg("scantient", "no data", "#9f9f9f"), { headers: svgHeaders });

  const findings = app.monitorRuns[0].findings;
  let score = 100;
  for (const f of findings) {
    if (f.severity === "CRITICAL") score -= 25;
    else if (f.severity === "HIGH") score -= 10;
    else if (f.severity === "MEDIUM") score -= 5;
    else score -= 1;
  }
  score = Math.max(0, score);
  const color = score >= 80 ? "#4c1" : score >= 50 ? "#dfb317" : "#e05d44";
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return new NextResponse(makeSvg("scantient", `${score} ${grade}`, color), { headers: svgHeaders });
}
