import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { encryptAuthHeaders, decryptAuthHeaders, maskAuthHeaders } from "@/lib/auth-headers";
import { getOrgLimits } from "@/lib/tenant";

const authHeaderSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});

const putBodySchema = z
  .array(authHeaderSchema)
  .max(10, "Maximum 10 auth headers allowed");

/** GET — return masked auth headers for the app (OWNER/ADMIN only, PRO+ tier) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(limits.tier)) {
    return NextResponse.json({ error: "Authenticated scanning requires a Pro plan or higher." }, { status: 403 });
  }

  const { id } = await params;
  const app = await db.monitoredApp.findFirst({ where: { id, orgId: session.orgId } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!app.authHeaders) {
    return NextResponse.json({ headers: [] });
  }

  const headers = decryptAuthHeaders(app.authHeaders);
  return NextResponse.json({ headers: maskAuthHeaders(headers) });
}

/** PUT — save/replace auth headers (OWNER/ADMIN only, PRO+ tier) */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(limits.tier)) {
    return NextResponse.json({ error: "Authenticated scanning requires a Pro plan or higher." }, { status: 403 });
  }

  const { id } = await params;
  const app = await db.monitoredApp.findFirst({ where: { id, orgId: session.orgId } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const encrypted = encryptAuthHeaders(parsed.data);
  await db.monitoredApp.update({
    where: { id },
    data: { authHeaders: encrypted },
  });

  return NextResponse.json({ ok: true, count: parsed.data.length });
}

/** DELETE — remove auth headers */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const app = await db.monitoredApp.findFirst({ where: { id, orgId: session.orgId } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.monitoredApp.update({ where: { id }, data: { authHeaders: null } });

  return NextResponse.json({ ok: true });
}
