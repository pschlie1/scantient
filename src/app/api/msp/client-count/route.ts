/**
 * GET /api/msp/client-count
 *
 * Returns the number of client orgs managed by the current user's org.
 * Used by the Nav component to conditionally show the MSP link.
 *
 * Response: { count: number }
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ count: 0 });
  }

  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    return NextResponse.json({ count: 0 });
  }

  const count = await db.organization.count({
    where: { parentOrgId: session.orgId },
  });

  return NextResponse.json({ count });
}
