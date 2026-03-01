import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { addHours } from "date-fns";
import { db } from "@/lib/db";
import { getOrgLimits } from "@/lib/tenant";
import { sendCriticalFindingsAlert } from "@/lib/alerts";
import type { SecurityFinding } from "@/lib/types";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const findingSchema = z.object({
  code: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  fixPrompt: z.string(),
});

const bodySchema = z.object({
  findings: z.array(findingSchema),
  responseTimeMs: z.number().optional(),
  statusCode: z.number().optional(),
});

function calcStatus(findings: SecurityFinding[]): "HEALTHY" | "WARNING" | "CRITICAL" {
  if (findings.some((f) => f.severity === "CRITICAL")) return "CRITICAL";
  if (findings.some((f) => f.severity === "HIGH")) return "WARNING";
  return "HEALTHY";
}

async function resolveAppFromBearer(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token.startsWith("sa_")) return null;

  const hash = sha256(token);
  return db.monitoredApp.findFirst({ where: { agentKeyHash: hash, agentEnabled: true } });
}

/** POST — agent pushes scan results */
export async function POST(req: Request) {
  const app = await resolveAppFromBearer(req.headers.get("authorization"));
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { findings, responseTimeMs, statusCode } = parsed.data;
  const status = calcStatus(findings as SecurityFinding[]);

  // Create the monitor run
  const run = await db.monitorRun.create({
    data: {
      appId: app.id,
      status,
      responseTimeMs: responseTimeMs ?? null,
      summary: `Agent scan: ${findings.length} finding(s) — status ${statusCode ?? "N/A"}`,
      checksRun: findings.length,
      completedAt: new Date(),
      findings: {
        create: findings.map((f) => ({
          code: f.code,
          title: f.title,
          description: f.description,
          severity: f.severity,
          fixPrompt: f.fixPrompt,
        })),
      },
    },
  });

  // Determine next check interval from org tier
  const orgLimits = await getOrgLimits(app.orgId);
  const scanIntervalHours: Record<string, number> = {
    ENTERPRISE: 1,
    PRO: 4,
    STARTER: 8,
    FREE: 24,
    EXPIRED: 24,
  };
  const intervalHours = scanIntervalHours[orgLimits.tier] ?? 24;

  await db.monitoredApp.update({
    where: { id: app.id },
    data: {
      status,
      lastCheckedAt: new Date(),
      nextCheckAt: addHours(new Date(), intervalHours),
      agentLastSeenAt: new Date(),
    },
  });

  // Send alerts for critical findings
  await sendCriticalFindingsAlert(app.id, findings as SecurityFinding[]);

  return NextResponse.json({ runId: run.id, status, findingsCount: findings.length });
}
