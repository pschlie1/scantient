import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { deobfuscate } from "@/lib/crypto-util";
import { createGitHubIssue } from "@/lib/github-issues";
import { getOrgLimits } from "@/lib/tenant";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole(["ADMIN", "OWNER"]);
    const limits = await getOrgLimits(session.orgId);
    if (!["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(limits.tier)) {
      return NextResponse.json({ error: "GitHub integration requires a Pro plan or higher." }, { status: 403 });
    }
    const { id } = await params;

    // Verify finding belongs to this org
    const finding = await db.finding.findFirst({
      where: {
        id,
        run: { app: { orgId: session.orgId } },
      },
    });

    if (!finding) {
      return NextResponse.json({ error: "Finding not found." }, { status: 404 });
    }

    // Get GitHub integration config
    const integration = await db.integrationConfig.findUnique({
      where: { orgId_type: { orgId: session.orgId, type: "github" } },
    });

    if (!integration || !integration.enabled) {
      return NextResponse.json(
        { error: "GitHub integration not configured. Set it up in Settings → Integrations." },
        { status: 409 },
      );
    }

    const cfg = integration.config as Record<string, string>;
    const config = {
      owner: cfg.owner,
      repo: cfg.repo,
      token: deobfuscate(cfg.token),
    };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://scantient.com";
    const dashboardUrl = `${appUrl}/dashboard/findings/${finding.id}`;

    const result = await createGitHubIssue(
      config,
      {
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        fixPrompt: finding.fixPrompt,
        code: finding.code,
      },
      dashboardUrl,
    );

    if (!result) {
      return NextResponse.json(
        { error: "Failed to create GitHub issue. Check your token permissions and repository name." },
        { status: 502 },
      );
    }

    // Log to audit log
    await db.auditLog.create({
      data: {
        orgId: session.orgId,
        userId: session.id,
        action: "finding.github_issue_created",
        resource: `finding:${finding.id}`,
        details: JSON.stringify({
          issueUrl: result.issueUrl,
          issueNumber: result.issueNumber,
          findingCode: finding.code,
          severity: finding.severity,
        }),
      },
    });

    return NextResponse.json({ issueUrl: result.issueUrl, issueNumber: result.issueNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}
