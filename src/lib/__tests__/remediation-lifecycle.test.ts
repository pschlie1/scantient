/**
 * remediation-lifecycle.test.ts
 * Tests for verifyResolvedFindings (audit-15: auto-resolve OPEN findings)
 * and addTimelineEvent / parseRemediationMeta utilities.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB mock ──────────────────────────────────────────────────────────────────
const findingFindUnique = vi.fn();
const findingUpdate = vi.fn();
const findingFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    finding: {
      findUnique: findingFindUnique,
      findMany: findingFindMany,
      update: findingUpdate,
    },
    findingAssignment: {},
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  findingUpdate.mockResolvedValue({});
});

// ─────────────────────────────────────────────────────────────────────────────
// parseRemediationMeta — unit tests
// ─────────────────────────────────────────────────────────────────────────────
describe("parseRemediationMeta", () => {
  it("returns default meta for null notes", async () => {
    const { parseRemediationMeta } = await import("@/lib/remediation-lifecycle");
    const { userNotes, meta } = parseRemediationMeta(null);
    expect(userNotes).toBe("");
    expect(meta.lifecycleStage).toBe("DETECTED");
    expect(meta.timeline).toEqual([]);
    expect(meta.linkedPRs).toEqual([]);
  });

  it("returns plain notes with default meta when no marker present", async () => {
    const { parseRemediationMeta } = await import("@/lib/remediation-lifecycle");
    const { userNotes, meta } = parseRemediationMeta("some plain notes");
    expect(userNotes).toBe("some plain notes");
    expect(meta.lifecycleStage).toBe("DETECTED");
  });

  it("parses notes with REMEDIATION_META marker", async () => {
    const { parseRemediationMeta, serializeWithMeta } = await import("@/lib/remediation-lifecycle");
    const meta = {
      lifecycleStage: "TRIAGED" as const,
      priority: "P1" as const,
      timeline: [{ timestamp: "2024-01-01T00:00:00Z", actor: "system", action: "triaged" }],
      linkedPRs: [],
    };
    const serialized = serializeWithMeta("user note", meta);
    const parsed = parseRemediationMeta(serialized);
    expect(parsed.userNotes).toBe("user note");
    expect(parsed.meta.lifecycleStage).toBe("TRIAGED");
    expect(parsed.meta.priority).toBe("P1");
    expect(parsed.meta.timeline).toHaveLength(1);
  });

  it("handles legacy STATUS_HISTORY marker gracefully", async () => {
    const { parseRemediationMeta } = await import("@/lib/remediation-lifecycle");
    const legacyNotes = 'some notes\n---STATUS_HISTORY---\n[{"previousStatus":"OPEN"}]';
    const { userNotes, meta } = parseRemediationMeta(legacyNotes);
    expect(userNotes).toBe("some notes");
    expect(meta.lifecycleStage).toBe("DETECTED"); // default
    expect(meta.timeline).toEqual([]);
  });

  it("returns default meta on corrupted JSON in marker", async () => {
    const { parseRemediationMeta } = await import("@/lib/remediation-lifecycle");
    const corruptedNotes = "user note\n---REMEDIATION_META---\n{not valid json";
    const { userNotes, meta } = parseRemediationMeta(corruptedNotes);
    expect(userNotes).toBe("user note");
    expect(meta.lifecycleStage).toBe("DETECTED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyResolvedFindings — auto-resolve OPEN findings (audit-15 C1 fix)
// ─────────────────────────────────────────────────────────────────────────────
describe("verifyResolvedFindings — auto-resolve OPEN findings", () => {
  it("auto-resolves an OPEN finding whose code is not in the new scan", async () => {
    const { verifyResolvedFindings } = await import("@/lib/remediation-lifecycle");

    // findMany returns: no RESOLVED findings, one OPEN finding
    findingFindMany
      .mockResolvedValueOnce([]) // RESOLVED findings
      .mockResolvedValueOnce([   // OPEN findings
        {
          id: "finding_open_1",
          code: "MISSING_HSTS",
          status: "OPEN",
          notes: null,
          run: { appId: "app_1" },
        },
      ]);

    // New scan has NO MISSING_HSTS → should auto-resolve
    const newCodes = new Set(["SOME_OTHER_CODE"]);
    await verifyResolvedFindings("app_1", newCodes);

    expect(findingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "finding_open_1" },
        data: expect.objectContaining({
          status: "RESOLVED",
          resolvedAt: expect.any(Date),
          notes: expect.stringContaining("auto_resolved"),
        }),
      }),
    );
  });

  it("does NOT auto-resolve an OPEN finding whose code is still detected", async () => {
    const { verifyResolvedFindings } = await import("@/lib/remediation-lifecycle");

    findingFindMany
      .mockResolvedValueOnce([]) // RESOLVED findings
      .mockResolvedValueOnce([   // OPEN findings
        {
          id: "finding_open_2",
          code: "MISSING_HSTS",
          status: "OPEN",
          notes: null,
          run: { appId: "app_1" },
        },
      ]);

    // New scan still has MISSING_HSTS → should NOT auto-resolve
    const newCodes = new Set(["MISSING_HSTS"]);
    await verifyResolvedFindings("app_1", newCodes);

    expect(findingUpdate).not.toHaveBeenCalled();
  });

  it("auto-resolves ACKNOWLEDGED findings no longer detected", async () => {
    const { verifyResolvedFindings } = await import("@/lib/remediation-lifecycle");

    findingFindMany
      .mockResolvedValueOnce([]) // RESOLVED findings
      .mockResolvedValueOnce([   // active findings
        {
          id: "finding_ack_1",
          code: "EXPOSED_API_KEY",
          status: "ACKNOWLEDGED",
          notes: null,
          run: { appId: "app_1" },
        },
      ]);

    const newCodes = new Set<string>(); // empty — nothing detected
    await verifyResolvedFindings("app_1", newCodes);

    expect(findingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "finding_ack_1" },
        data: expect.objectContaining({ status: "RESOLVED" }),
      }),
    );
  });

  it("reopens a RESOLVED finding that re-appears in new scan (regression)", async () => {
    const { verifyResolvedFindings } = await import("@/lib/remediation-lifecycle");

    findingFindMany
      .mockResolvedValueOnce([   // RESOLVED findings
        {
          id: "finding_resolved_1",
          code: "MISSING_HSTS",
          status: "RESOLVED",
          notes: null,
          run: { appId: "app_1" },
        },
      ])
      .mockResolvedValueOnce([]); // no active findings

    // New scan detected MISSING_HSTS again → regression → reopen
    const newCodes = new Set(["MISSING_HSTS"]);
    await verifyResolvedFindings("app_1", newCodes);

    expect(findingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "finding_resolved_1" },
        data: expect.objectContaining({
          status: "OPEN",
          resolvedAt: null,
          notes: expect.stringContaining("verification_failed"),
        }),
      }),
    );
  });

  it("keeps a RESOLVED finding closed when not detected in new scan", async () => {
    const { verifyResolvedFindings } = await import("@/lib/remediation-lifecycle");

    findingFindMany
      .mockResolvedValueOnce([   // RESOLVED findings
        {
          id: "finding_resolved_2",
          code: "MISSING_HSTS",
          status: "RESOLVED",
          notes: null,
          run: { appId: "app_1" },
        },
      ])
      .mockResolvedValueOnce([]); // no active findings

    // New scan has no MISSING_HSTS → confirmed fixed
    const newCodes = new Set<string>();
    await verifyResolvedFindings("app_1", newCodes);

    expect(findingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "finding_resolved_2" },
        data: expect.objectContaining({
          notes: expect.stringContaining("verified_closed"),
        }),
      }),
    );
    // resolvedAt should NOT be reset
    const callData = findingUpdate.mock.calls[0][0].data;
    expect(callData.status).toBeUndefined(); // status not changed
    expect(callData.resolvedAt).toBeUndefined();
  });

  it("handles empty scan (all findings auto-resolved)", async () => {
    const { verifyResolvedFindings } = await import("@/lib/remediation-lifecycle");

    findingFindMany
      .mockResolvedValueOnce([]) // no RESOLVED findings
      .mockResolvedValueOnce([   // multiple OPEN findings
        { id: "f1", code: "CODE_A", status: "OPEN", notes: null, run: { appId: "app_1" } },
        { id: "f2", code: "CODE_B", status: "IN_PROGRESS", notes: null, run: { appId: "app_1" } },
      ]);

    // Empty scan — nothing detected
    await verifyResolvedFindings("app_1", new Set<string>());

    expect(findingUpdate).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addTimelineEvent
// ─────────────────────────────────────────────────────────────────────────────
describe("addTimelineEvent", () => {
  it("appends a timeline event to finding notes", async () => {
    const { addTimelineEvent } = await import("@/lib/remediation-lifecycle");

    findingFindUnique.mockResolvedValueOnce({ id: "f1", notes: null });

    const event = {
      timestamp: "2024-06-01T00:00:00Z",
      actor: "user_123",
      action: "status_changed",
      details: "OPEN → ACKNOWLEDGED",
    };
    await addTimelineEvent("f1", event);

    expect(findingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f1" },
        data: expect.objectContaining({
          notes: expect.stringContaining("status_changed"),
        }),
      }),
    );
  });

  it("throws when finding not found", async () => {
    const { addTimelineEvent } = await import("@/lib/remediation-lifecycle");
    findingFindUnique.mockResolvedValueOnce(null);
    await expect(
      addTimelineEvent("nonexistent", { timestamp: "", actor: "", action: "" }),
    ).rejects.toThrow("Finding not found");
  });
});
