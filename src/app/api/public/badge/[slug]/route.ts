/**
 * Public security badge by org slug.
 * Allows orgs to embed a badge showing their overall security score.
 * Example: /api/public/badge/acme-corp?format=svg
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calcScore, scoreToGrade, scoreToColor, makeBadgeSvg } from "@/app/api/public/badge/route";
import { applyCors, corsPreflightResponse, CORS_HEADERS_PUBLIC } from "@/lib/cors";

export function OPTIONS() {
  return corsPreflightResponse(CORS_HEADERS_PUBLIC);
}

async function handler(
  req: Request,
  params: Promise<{ slug: string }>,
): Promise<NextResponse> {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "svg";

  const svgHeaders = {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
  };
  const jsonHeaders = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
  };

  const org = await db.organization.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });

  if (!org) {
    if (format === "json") {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (format === "shield") {
      return NextResponse.json(
        { schemaVersion: 1, label: "Scantient", message: "not found", color: "grey" },
        { headers: jsonHeaders },
      );
    }
    // Return a neutral badge
    return new NextResponse(makeBadgeSvg(0, "N/A"), { headers: svgHeaders });
  }

  // Get the latest run for each app in this org and compute org-wide average score
  const apps = await db.monitoredApp.findMany({
    where: { orgId: org.id },
    include: {
      monitorRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: { findings: { select: { severity: true } } },
      },
    },
  });

  const scores = apps
    .filter((a) => a.monitorRuns.length > 0)
    .map((a) => calcScore(a.monitorRuns[0].findings));

  if (scores.length === 0) {
    if (format === "json") {
      return NextResponse.json({ error: "No scan data available" }, { status: 404 });
    }
    if (format === "shield") {
      return NextResponse.json(
        { schemaVersion: 1, label: "Scantient", message: "no data", color: "grey" },
        { headers: jsonHeaders },
      );
    }
    return new NextResponse(makeBadgeSvg(0, "N/A"), { headers: svgHeaders });
  }

  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const grade = scoreToGrade(avgScore);
  const color = scoreToColor(avgScore);

  if (format === "json") {
    return NextResponse.json(
      {
        org: org.name,
        score: avgScore,
        grade,
        color,
        status: avgScore >= 80 ? "healthy" : avgScore >= 50 ? "warning" : "critical",
        appsScanned: scores.length,
      },
      { headers: jsonHeaders },
    );
  }

  if (format === "shield") {
    const shieldColor = avgScore >= 80 ? "brightgreen" : avgScore >= 50 ? "yellow" : "red";
    return NextResponse.json(
      {
        schemaVersion: 1,
        label: "Scantient",
        message: `${avgScore} ${grade}`,
        color: shieldColor,
      },
      { headers: jsonHeaders },
    );
  }

  // Default: SVG
  return new NextResponse(makeBadgeSvg(avgScore, grade), { headers: svgHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return applyCors(await handler(req, params), CORS_HEADERS_PUBLIC);
}
