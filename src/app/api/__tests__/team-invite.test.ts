/**
 * team-invite.test.ts
 * Tests for POST /api/team (invite flow)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Auth mock ---
const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession }));

// --- DB mocks ---
const userFindFirst = vi.fn();
const inviteFindFirst = vi.fn();
const inviteCreate = vi.fn();
const orgFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: { findFirst: userFindFirst },
    invite: {
      findFirst: inviteFindFirst,
      create: inviteCreate,
    },
    organization: { findUnique: orgFindUnique },
  },
}));

// --- Tenant mocks ---
const canAddUser = vi.fn();
const logAudit = vi.fn();
vi.mock("@/lib/tenant", () => ({ canAddUser, logAudit }));

// Prevent real fetch in invite email sending
vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({
    id: "user_1",
    orgId: "org_a",
    role: "ADMIN",
    name: "Admin User",
    orgName: "TestOrg",
  });
  canAddUser.mockResolvedValue({ allowed: true });
  orgFindUnique.mockResolvedValue({ name: "TestOrg" });
  inviteCreate.mockResolvedValue({ id: "invite_1", token: "abc123" });
  logAudit.mockResolvedValue(undefined);
  userFindFirst.mockResolvedValue(null);
  inviteFindFirst.mockResolvedValue(null);
});

function makeReq(body: unknown) {
  return new Request("http://localhost/api/team", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/team (invite flow)", () => {
  it("returns 401 when not authenticated", async () => {
    getSession.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeReq({ email: "a@b.com", role: "MEMBER" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is MEMBER", async () => {
    getSession.mockResolvedValueOnce({
      id: "user_1",
      orgId: "org_a",
      role: "MEMBER",
      name: "Member User",
      orgName: "TestOrg",
    });
    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeReq({ email: "a@b.com", role: "MEMBER" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when role is VIEWER", async () => {
    getSession.mockResolvedValueOnce({
      id: "user_1",
      orgId: "org_a",
      role: "VIEWER",
      name: "Viewer User",
      orgName: "TestOrg",
    });
    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeReq({ email: "a@b.com", role: "MEMBER" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when org is at user limit", async () => {
    canAddUser.mockResolvedValueOnce({ allowed: false, reason: "User limit reached" });
    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeReq({ email: "new@example.com", role: "MEMBER" }));
    expect(res.status).toBe(403);
  });

  it("returns 409 when user already in org", async () => {
    userFindFirst.mockResolvedValueOnce({ id: "existing_user", email: "existing@example.com" });
    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeReq({ email: "existing@example.com", role: "MEMBER" }));
    expect(res.status).toBe(409);
  });

  it("returns 409 when active invite already exists for this email", async () => {
    userFindFirst.mockResolvedValueOnce(null); // no existing user
    inviteFindFirst.mockResolvedValueOnce({ id: "invite_existing", email: "pending@example.com" }); // pending invite
    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeReq({ email: "pending@example.com", role: "MEMBER" }));
    expect(res.status).toBe(409);
  });

  it("returns 201 and creates Invite record on valid invite", async () => {
    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeReq({ email: "new@example.com", role: "MEMBER" }));
    expect(res.status).toBe(201);
    expect(inviteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "new@example.com", role: "MEMBER", orgId: "org_a" }),
      }),
    );
  });

  it("does NOT create a User directly (uses Invite record only)", async () => {
    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeReq({ email: "new@example.com", role: "MEMBER" }));
    // Invite record should be created, not a User directly
    expect(inviteCreate).toHaveBeenCalled();
    // Response should be 201
    expect(res.status).toBe(201);
    // The db.user mock has no 'create' method defined — any attempt to call it would throw.
    // The fact that the test succeeds confirms no db.user.create was called.
  });

  it("OWNER can invite team members", async () => {
    getSession.mockResolvedValueOnce({
      id: "owner_1",
      orgId: "org_a",
      role: "OWNER",
      name: "Owner",
      orgName: "TestOrg",
    });
    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeReq({ email: "invited@example.com", role: "ADMIN" }));
    expect(res.status).toBe(201);
  });
});
