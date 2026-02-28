/**
 * Remediation Lifecycle Engine
 *
 * Lifecycle stages: DETECTED → TRIAGED → ASSIGNED → FIX_IN_PROGRESS → VERIFICATION → CLOSED
 *
 * Data is stored in the Finding `notes` field using structured JSON markers
 * to avoid schema changes.
 */

import { db } from "@/lib/db";
import type { FindingStatus } from "@/generated/prisma/enums";

// ─── Metadata stored in Finding.notes ───────────────

const METADATA_MARKER = "\n---REMEDIATION_META---\n";

export interface TimelineEvent {
  timestamp: string;
  actor: string; // userId or "system"
  action: string;
  details?: string;
}

export interface LinkedPR {
  url: string;
  title?: string;
  linkedAt: string;
  linkedBy: string;
}

export interface RemediationMeta {
  lifecycleStage: LifecycleStage;
  priority?: "P0" | "P1" | "P2" | "P3";
  suggestedAssignee?: string;
  timeline: TimelineEvent[];
  linkedPRs: LinkedPR[];
  verificationPending?: boolean;
}

export type LifecycleStage =
  | "DETECTED"
  | "TRIAGED"
  | "ASSIGNED"
  | "FIX_IN_PROGRESS"
  | "VERIFICATION"
  | "CLOSED";

export function parseRemediationMeta(notes: string | null): {
  userNotes: string;
  meta: RemediationMeta;
} {
  const defaultMeta: RemediationMeta = {
    lifecycleStage: "DETECTED",
    timeline: [],
    linkedPRs: [],
  };

  if (!notes) return { userNotes: "", meta: defaultMeta };

  const idx = notes.indexOf(METADATA_MARKER);
  if (idx === -1) {
    // Check for legacy STATUS_HISTORY marker and preserve user notes
    const legacyIdx = notes.indexOf("\n---STATUS_HISTORY---\n");
    if (legacyIdx !== -1) return { userNotes: notes.slice(0, legacyIdx), meta: defaultMeta };
    return { userNotes: notes, meta: defaultMeta };
  }

  try {
    const meta = JSON.parse(notes.slice(idx + METADATA_MARKER.length)) as RemediationMeta;
    return { userNotes: notes.slice(0, idx), meta };
  } catch {
    return { userNotes: notes.slice(0, idx), meta: defaultMeta };
  }
}

export function serializeWithMeta(userNotes: string, meta: RemediationMeta): string {
  return `${userNotes}${METADATA_MARKER}${JSON.stringify(meta)}`;
}

// ─── Auto-Triage ────────────────────────────────────

const SEVERITY_PRIORITY: Record<string, "P0" | "P1" | "P2" | "P3"> = {
  CRITICAL: "P0",
  HIGH: "P1",
  MEDIUM: "P2",
  LOW: "P3",
};

/**
 * Auto-triage a newly created finding: set priority based on severity,
 * suggest an assignee based on past assignment patterns for the finding category.
 */
export async function autoTriageFinding(findingId: string): Promise<void> {
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: { run: { select: { app: { select: { orgId: true } } } } },
  });
  if (!finding) return;

  const { userNotes, meta } = parseRemediationMeta(finding.notes);
  const priority = SEVERITY_PRIORITY[finding.severity] ?? "P2";

  // Find suggested assignee: who was most recently assigned to findings with the same code?
  const pastAssignment = await db.findingAssignment.findFirst({
    where: {
      finding: {
        code: finding.code,
        run: { app: { orgId: finding.run.app.orgId } },
      },
    },
    orderBy: { assignedAt: "desc" },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });

  meta.lifecycleStage = "TRIAGED";
  meta.priority = priority;
  meta.suggestedAssignee = pastAssignment?.userId ?? undefined;

  meta.timeline.push({
    timestamp: new Date().toISOString(),
    actor: "system",
    action: "detected",
    details: `Finding detected: ${finding.title} (${finding.severity})`,
  });

  meta.timeline.push({
    timestamp: new Date().toISOString(),
    actor: "system",
    action: "triaged",
    details: `Auto-triaged as ${priority}${pastAssignment ? ` — suggested assignee: ${pastAssignment.user.name ?? pastAssignment.user.email}` : ""}`,
  });

  await db.finding.update({
    where: { id: findingId },
    data: { notes: serializeWithMeta(userNotes, meta) },
  });
}

// ─── Lifecycle Stage Transitions ────────────────────

export function mapStatusToStage(status: FindingStatus, meta: RemediationMeta): LifecycleStage {
  switch (status) {
    case "OPEN":
      return meta.timeline.length > 1 ? "TRIAGED" : "DETECTED";
    case "ACKNOWLEDGED":
      return "TRIAGED";
    case "IN_PROGRESS":
      return meta.linkedPRs.length > 0 ? "FIX_IN_PROGRESS" : "ASSIGNED";
    case "RESOLVED":
      return "VERIFICATION";
    case "IGNORED":
      return "CLOSED";
    default:
      return "DETECTED";
  }
}

export async function addTimelineEvent(
  findingId: string,
  event: TimelineEvent,
): Promise<RemediationMeta> {
  const finding = await db.finding.findUnique({ where: { id: findingId } });
  if (!finding) throw new Error("Finding not found");

  const { userNotes, meta } = parseRemediationMeta(finding.notes);
  meta.timeline.push(event);

  await db.finding.update({
    where: { id: findingId },
    data: { notes: serializeWithMeta(userNotes, meta) },
  });

  return meta;
}

export async function linkPRToFinding(
  findingId: string,
  pr: LinkedPR,
): Promise<RemediationMeta> {
  const finding = await db.finding.findUnique({ where: { id: findingId } });
  if (!finding) throw new Error("Finding not found");

  const { userNotes, meta } = parseRemediationMeta(finding.notes);
  meta.linkedPRs.push(pr);
  meta.lifecycleStage = "FIX_IN_PROGRESS";

  meta.timeline.push({
    timestamp: new Date().toISOString(),
    actor: pr.linkedBy,
    action: "pr_linked",
    details: `Linked PR: ${pr.url}${pr.title ? ` — ${pr.title}` : ""}`,
  });

  await db.finding.update({
    where: { id: findingId },
    data: { notes: serializeWithMeta(userNotes, meta) },
  });

  return meta;
}

// ─── Verification ───────────────────────────────────

/**
 * After a scan completes, verify resolved findings.
 * - If the finding's code is still detected in the new scan → reopen
 * - If the finding's code is NOT detected → close with evidence
 */
export async function verifyResolvedFindings(appId: string, newFindingCodes: Set<string>): Promise<void> {
  // Find all RESOLVED findings for this app that are pending verification
  const resolvedFindings = await db.finding.findMany({
    where: {
      status: "RESOLVED",
      run: { appId },
    },
    include: { run: { select: { appId: true } } },
  });

  for (const finding of resolvedFindings) {
    const { userNotes, meta } = parseRemediationMeta(finding.notes);

    if (newFindingCodes.has(finding.code)) {
      // Still present — reopen
      meta.lifecycleStage = "TRIAGED";
      meta.verificationPending = false;
      meta.timeline.push({
        timestamp: new Date().toISOString(),
        actor: "system",
        action: "verification_failed",
        details: "Automated verification failed — issue still present in latest scan",
      });

      await db.finding.update({
        where: { id: finding.id },
        data: {
          status: "OPEN",
          resolvedAt: null,
          notes: serializeWithMeta(userNotes, meta),
        },
      });
    } else {
      // Gone — close with evidence
      meta.lifecycleStage = "CLOSED";
      meta.verificationPending = false;
      meta.timeline.push({
        timestamp: new Date().toISOString(),
        actor: "system",
        action: "verified_closed",
        details: "Verified fixed by automated re-scan — issue no longer detected",
      });

      await db.finding.update({
        where: { id: finding.id },
        data: {
          notes: serializeWithMeta(userNotes, meta),
        },
      });
    }
  }
}
