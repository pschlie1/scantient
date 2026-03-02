/**
 * GET /api/msp/overview
 *
 * Returns summary data for all client orgs managed by the current user's org.
 * Only accessible to OWNER or ADMIN role users.
 *
 * Response shape:
 * {
 *   mspOrgId: string;
 *   mspOrgName: string;
 *   clients: MspClientSummary[];
 * }
 *
 * MspClientSummary:
 * {
 *   orgId: string;
 *   orgName: string;
 *   orgSlug: string;
 *   totalApps: number;
 *   criticalFindings: number;   // open CRITICAL severity findings
 *   highFindings: number;       // open HIGH severity findings
 *   lastScanAt: string | null;  // ISO date of most recent monitor run across all apps
 *   complianceGrade: string;    // A-F computed from open findings
 *   complianceScore: number;    // 0-100
 * }
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Map a 0-100 compliance score to an A-F letter grade */
function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Simple compliance score based on severity distribution of open findings.
 * Weighted penalty: CRITICAL=25, HIGH=10, MEDIUM=3, LOW=1 per finding.
 * Score = max(0, 100 - totalPenalty), capped at 100.
 */
function computeComplianceScore(findings: { severity: string }[]): number {
  const penalty = findings.reduce((sum, f) => {
    switch (f.severity) {
      case "CRITICAL":
        return sum + 25;
      case "HIGH":
        return sum + 10;
      case "MEDIUM":
        return sum + 3;
      default:
        return sum + 1;
    }
  }, 0);
  return Math.max(0, 100 - penalty);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch all client orgs where this org is the parent (MSP)
  const clientOrgs = await db.organization.findMany({
    where: { parentOrgId: session.orgId },
    orderBy: { name: "asc" },
    include: {
      apps: {
        select: {
          id: true,
          lastCheckedAt: true,
          monitorRuns: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: {
              startedAt: true,
              findings: {
                where: { status: { notIn: ["RESOLVED", "IGNORED"] } },
                select: { severity: true },
              },
            },
          },
        },
      },
    },
  });

  const clients = clientOrgs.map((org) => {
    // Collect all open findings across all apps' most recent runs
    const allOpenFindings: { severity: string }[] = [];
    let lastScanAt: Date | null = null;

    for (const app of org.apps) {
      const latestRun = app.monitorRuns[0];
      if (latestRun) {
        allOpenFindings.push(...latestRun.findings);

        if (!lastScanAt || latestRun.startedAt > lastScanAt) {
          lastScanAt = latestRun.startedAt;
        }
      }
    }

    const criticalFindings = allOpenFindings.filter((f) => f.severity === "CRITICAL").length;
    const highFindings = allOpenFindings.filter((f) => f.severity === "HIGH").length;
    const complianceScore = computeComplianceScore(allOpenFindings);

    return {
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      totalApps: org.apps.length,
      criticalFindings,
      highFindings,
      totalOpenFindings: allOpenFindings.length,
      lastScanAt: lastScanAt ? (lastScanAt as Date).toISOString() : null,
      complianceScore,
      complianceGrade: scoreToGrade(complianceScore),
    };
  });

  // Sort by most critical findings first, then by high findings
  clients.sort((a, b) => {
    if (b.criticalFindings !== a.criticalFindings) {
      return b.criticalFindings - a.criticalFindings;
    }
    return b.highFindings - a.highFindings;
  });

  return NextResponse.json({
    mspOrgId: session.orgId,
    mspOrgName: session.orgName,
    clientCount: clients.length,
    clients,
  });
}
