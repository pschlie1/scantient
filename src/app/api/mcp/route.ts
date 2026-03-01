import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { runHttpScanForApp } from "@/lib/scanner-http";
import { logApiError } from "@/lib/observability";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgLimits } from "@/lib/tenant";
import type { FindingSeverity, FindingStatus } from "@prisma/client";

// MCP JSON-RPC compatible endpoint
// Spec: https://modelcontextprotocol.io

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

function ok(id: string | number, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function err(id: string | number | null, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

const TOOLS = [
  {
    name: "list_apps",
    description: "List all monitored applications for your organization",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_app_status",
    description: "Get detailed status of a specific app including latest scan, finding counts by severity, and security score",
    inputSchema: {
      type: "object",
      properties: { appId: { type: "string", description: "The application ID" } },
      required: ["appId"],
    },
  },
  {
    name: "get_findings",
    description: "Get security findings for an app, optionally filtered by status and severity",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "The application ID" },
        status: { type: "string", enum: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "IGNORED"] },
        severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      },
      required: ["appId"],
    },
  },
  {
    name: "trigger_scan",
    description: "Trigger an HTTP security scan for an app",
    inputSchema: {
      type: "object",
      properties: { appId: { type: "string", description: "The application ID" } },
      required: ["appId"],
    },
  },
  {
    name: "get_security_score",
    description: "Get security score for a specific app or portfolio-wide average",
    inputSchema: {
      type: "object",
      properties: { appId: { type: "string", description: "Optional app ID. Omit for portfolio-wide score." } },
    },
  },
  {
    name: "resolve_finding",
    description: "Update the status of a finding (e.g. resolve, acknowledge, ignore)",
    inputSchema: {
      type: "object",
      properties: {
        findingId: { type: "string", description: "The finding ID" },
        status: { type: "string", enum: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "IGNORED"] },
      },
      required: ["findingId", "status"],
    },
  },
  {
    name: "get_remediation_metrics",
    description: "Get org-level remediation metrics: finding counts by status, fix rate, and basic MTTR",
    inputSchema: { type: "object", properties: {} },
  },
];

// --- Helper: compute security score from finding severity counts ---
function computeScore(counts: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number }) {
  const penalty = counts.CRITICAL * 25 + counts.HIGH * 10 + counts.MEDIUM * 3 + counts.LOW * 1;
  return Math.max(0, 100 - penalty);
}

function gradeFromScore(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "B+";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// --- Verify app belongs to org ---
async function verifyAppOwnership(appId: string, orgId: string) {
  const app = await db.monitoredApp.findFirst({ where: { id: appId, orgId } });
  return app;
}

// --- Get severity counts for open findings of an app ---
async function getSeverityCounts(appId: string) {
  const findings = await db.finding.findMany({
    where: {
      run: { appId },
      status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] },
    },
    select: { severity: true },
  });
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) {
    counts[f.severity]++;
  }
  return counts;
}

// --- Tool execution ---
async function executeTool(name: string, args: Record<string, unknown>, orgId: string) {
  switch (name) {
    case "list_apps": {
      const apps = await db.monitoredApp.findMany({
        where: { orgId },
        select: { id: true, name: true, url: true, status: true, lastCheckedAt: true },
        orderBy: { name: "asc" },
        take: 200,
      });
      return { apps };
    }

    case "get_app_status": {
      const app = await verifyAppOwnership(args.appId as string, orgId);
      if (!app) return { error: "App not found or access denied" };

      const latestRun = await db.monitorRun.findFirst({
        where: { appId: app.id },
        orderBy: { startedAt: "desc" },
        select: { id: true, status: true, responseTimeMs: true, summary: true, startedAt: true, completedAt: true },
      });

      const counts = await getSeverityCounts(app.id);
      const score = computeScore(counts);

      return {
        app: { id: app.id, name: app.name, url: app.url, status: app.status },
        latestRun,
        findingCounts: counts,
        securityScore: score,
        grade: gradeFromScore(score),
      };
    }

    case "get_findings": {
      const appId = args.appId as string;
      const app = await verifyAppOwnership(appId, orgId);
      if (!app) return { error: "App not found or access denied" };

      const where: Record<string, unknown> = { run: { appId } };
      if (args.status) where.status = args.status as FindingStatus;
      if (args.severity) where.severity = args.severity as FindingSeverity;

      const findings = await db.finding.findMany({
        where,
        select: {
          id: true,
          code: true,
          title: true,
          severity: true,
          description: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return { findings, total: findings.length };
    }

    case "trigger_scan": {
      const appId = args.appId as string;
      const app = await verifyAppOwnership(appId, orgId);
      if (!app) return { error: "App not found or access denied" };

      // Enforce per-tier rate limits (same thresholds as /api/scan/[id])
      const limits = await getOrgLimits(orgId);
      const scanTier = limits.tier;
      const maxScans =
        scanTier === "ENTERPRISE" || scanTier === "ENTERPRISE_PLUS" ? 200
        : scanTier === "PRO" ? 50
        : scanTier === "STARTER" ? 10
        : 3;

      const rl = await checkRateLimit(`mcp-scan:${orgId}`, {
        maxAttempts: maxScans,
        windowMs: 86400000,
      });
      if (!rl.allowed) {
        return { error: "Rate limit exceeded. Upgrade for more scans." };
      }

      const result = await runHttpScanForApp(appId);
      return {
        appId: result.appId,
        status: result.status,
        findingsCount: result.findingsCount,
        responseTimeMs: result.responseTimeMs,
      };
    }

    case "get_security_score": {
      if (args.appId) {
        const app = await verifyAppOwnership(args.appId as string, orgId);
        if (!app) return { error: "App not found or access denied" };
        const counts = await getSeverityCounts(app.id);
        const score = computeScore(counts);
        return { appId: app.id, name: app.name, score, grade: gradeFromScore(score) };
      }

      // Portfolio-wide
      const apps = await db.monitoredApp.findMany({ where: { orgId }, select: { id: true, name: true } });
      if (apps.length === 0) return { score: 100, grade: "A+", appCount: 0 };

      let total = 0;
      const appScores: Array<{ appId: string; name: string; score: number }> = [];
      for (const app of apps) {
        const counts = await getSeverityCounts(app.id);
        const score = computeScore(counts);
        total += score;
        appScores.push({ appId: app.id, name: app.name, score });
      }
      const avg = Math.round(total / apps.length);
      return { score: avg, grade: gradeFromScore(avg), appCount: apps.length, apps: appScores };
    }

    case "resolve_finding": {
      const findingId = args.findingId as string;
      const newStatus = args.status as FindingStatus;
      if (!["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "IGNORED"].includes(newStatus)) {
        return { error: "Invalid status" };
      }

      // Verify finding belongs to org
      const finding = await db.finding.findFirst({
        where: { id: findingId },
        include: { run: { include: { app: { select: { orgId: true } } } } },
      });
      if (!finding || finding.run.app.orgId !== orgId) {
        return { error: "Finding not found or access denied" };
      }

      const updateData: Record<string, unknown> = { status: newStatus };
      if (newStatus === "RESOLVED") updateData.resolvedAt = new Date();
      if (newStatus === "ACKNOWLEDGED") updateData.acknowledgedAt = new Date();

      const updated = await db.finding.update({
        where: { id: findingId },
        data: updateData,
        select: { id: true, status: true, resolvedAt: true, acknowledgedAt: true },
      });
      return { finding: updated };
    }

    case "get_remediation_metrics": {
      const appIds = await db.monitoredApp.findMany({
        where: { orgId },
        select: { id: true },
        take: 200,
      });
      const appIdList = appIds.map((a) => a.id);

      // Cap at 5000 findings — sufficient for metrics; prevents OOM on large orgs
      const allFindings = await db.finding.findMany({
        where: { run: { appId: { in: appIdList } } },
        select: { status: true, createdAt: true, resolvedAt: true, acknowledgedAt: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });

      const byStatus: Record<string, number> = {};
      let resolvedCount = 0;
      let totalTTR = 0;
      let totalTTA = 0;
      let ttaCount = 0;

      for (const f of allFindings) {
        byStatus[f.status] = (byStatus[f.status] || 0) + 1;
        if (f.status === "RESOLVED" && f.resolvedAt) {
          resolvedCount++;
          totalTTR += f.resolvedAt.getTime() - f.createdAt.getTime();
        }
        if (f.acknowledgedAt) {
          ttaCount++;
          totalTTA += f.acknowledgedAt.getTime() - f.createdAt.getTime();
        }
      }

      const total = allFindings.length;
      const fixRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;
      const mttrHours = resolvedCount > 0 ? Math.round(totalTTR / resolvedCount / 3600000 * 10) / 10 : null;
      const mttaHours = ttaCount > 0 ? Math.round(totalTTA / ttaCount / 3600000 * 10) / 10 : null;

      return {
        totalFindings: total,
        byStatus,
        fixRate: `${fixRate}%`,
        mttrHours,
        mttaHours,
      };
    }

    default:
      return null;
  }
}

export async function POST(req: Request) {
  const orgId = await authenticateApiKey(req);
  if (!orgId) {
    return NextResponse.json(
      { error: "Unauthorized: valid API key required via Authorization header" },
      { status: 401 },
    );
  }

  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return err(null, -32700, "Parse error");
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return err(body.id ?? null, -32600, "Invalid Request");
  }

  const { id, method, params } = body;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "scantient-mcp", version: "2.0.0" },
      capabilities: { tools: {} },
    });
  }

  if (method === "tools/list") {
    return ok(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const toolName = (params as Record<string, unknown>)?.name as string;
    const toolArgs = ((params as Record<string, unknown>)?.arguments ?? {}) as Record<string, unknown>;

    try {
      const result = await executeTool(toolName, toolArgs, orgId);
      if (result === null) return err(id, -32602, `Unknown tool: ${toolName}`);
      return ok(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
    } catch (e) {
      logApiError(e, {
        route: "/api/mcp",
        method: "POST",
        orgId,
        statusCode: 500,
        details: { method: "tools/call", toolName },
      });
      const message = e instanceof Error ? e.message : "Internal error";
      return err(id, -32000, message);
    }
  }

  return err(id, -32601, "Method not found");
}
