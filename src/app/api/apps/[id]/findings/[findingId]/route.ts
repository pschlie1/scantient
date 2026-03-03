/**
 * PATCH /api/apps/[id]/findings/[findingId]
 *
 * App-scoped wrapper around the canonical finding update endpoint.
 * Delegates to the same auth + validation logic but provides a
 * resource-nested URL for the Fix → Verify loop UI.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";
import { checkRateLimit } from "@/lib/rate-limit";
import { addTimelineEvent } from "@/lib/remediation-lifecycle";

const updateFindingSchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "IGNORED"]),
  notes: z.string().max(10000, "Notes cannot exceed 10,000 characters").optional(),
});

interface StatusChangeEntry {
  previousStatus: string;
  newStatus: string;
  changedAt: string;
  changedBy: string | null;
}

function parseStatusHistory(notes: string | null): { userNotes: string; history: StatusChangeEntry[] } {
  if (!notes) return { userNotes: "", history: [] };
  const marker = "\n---STATUS_HISTORY---\n";
  const idx = notes.indexOf(marker);
  if (idx === -1) return { userNotes: notes, history: [] };
  try {
    const history = JSON.parse(notes.slice(idx + marker.length)) as StatusChangeEntry[];
    return { userNotes: notes.slice(0, idx), history };
  } catch {
    return { userNotes: notes, history: [] };
  }
}

function serializeNotes(userNotes: string, history: StatusChangeEntry[]): string {
  if (history.length === 0) return userNotes;
  return `${userNotes}\n---STATUS_HISTORY---\n${JSON.stringify(history)}`;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; findingId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role === "VIEWER") {
    return NextResponse.json({ error: "Viewers have read-only access" }, { status: 403 });
  }

  const rl = await checkRateLimit(`finding-update:${session.orgId}`, {
    maxAttempts: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
    });
  }

  const { id: appId, findingId } = await params;
  const body = await req.json();
  const parsed = updateFindingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify the finding belongs to this org AND this app
  const finding = await db.finding.findFirst({
    where: {
      id: findingId,
      appId,
      run: { app: { orgId: session.orgId } },
    },
  });

  if (!finding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { userNotes, history } = parseStatusHistory(finding.notes);
  if (finding.status !== parsed.data.status) {
    history.push({
      previousStatus: finding.status,
      newStatus: parsed.data.status,
      changedAt: new Date().toISOString(),
      changedBy: session.id ?? null,
    });
  }

  const newUserNotes = parsed.data.notes ?? userNotes;

  const updated = await db.finding.update({
    where: { id: findingId },
    data: {
      status: parsed.data.status,
      notes: serializeNotes(newUserNotes, history),
      ...(parsed.data.status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
      ...(parsed.data.status === "ACKNOWLEDGED" ? { acknowledgedAt: new Date() } : {}),
    },
  });

  if (finding.status !== parsed.data.status) {
    await addTimelineEvent(updated.id, {
      timestamp: new Date().toISOString(),
      actor: session.id ?? "system",
      action: "status_changed",
      details: `Status changed: ${finding.status} → ${parsed.data.status}`,
    });

    await db.auditLog.create({
      data: {
        orgId: session.orgId,
        userId: session.id ?? undefined,
        action: "FINDING_STATUS_CHANGE",
        resource: `finding:${findingId}`,
        details: JSON.stringify({
          previousStatus: finding.status,
          newStatus: parsed.data.status,
        }),
      },
    });

    if (parsed.data.status === "RESOLVED") {
      await trackEvent({
        event: "finding_resolved",
        orgId: session.orgId,
        userId: session.id,
        properties: {
          findingId,
          previousStatus: finding.status,
          severity: finding.severity,
        },
      });
    }
  }

  return NextResponse.json({ finding: updated });
}
