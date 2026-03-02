import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateEvidencePack } from "@/lib/pdf-report";
import { getOrgLimits } from "@/lib/tenant";
import { logApiError } from "@/lib/observability";

export const dynamic = "force-dynamic";

const VALID_FRAMEWORKS = ["soc2", "iso27001", "nist"] as const;
type Framework = (typeof VALID_FRAMEWORKS)[number];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(limits.tier)) {
    return NextResponse.json(
      { error: "Evidence packs are available on Pro and Enterprise plans" },
      { status: 403 },
    );
  }

  const { searchParams } = req.nextUrl;
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const frameworkStr = searchParams.get("framework");

  if (!fromStr || !toStr || !frameworkStr) {
    return NextResponse.json(
      { error: "Missing required parameters: from, to, framework" },
      { status: 400 },
    );
  }

  if (!VALID_FRAMEWORKS.includes(frameworkStr as Framework)) {
    return NextResponse.json(
      { error: `Invalid framework. Must be one of: ${VALID_FRAMEWORKS.join(", ")}` },
      { status: 400 },
    );
  }

  const from = new Date(fromStr);
  const to = new Date(toStr);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  if (to <= from) {
    return NextResponse.json({ error: "'to' date must be after 'from' date" }, { status: 400 });
  }

  const MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return NextResponse.json({ error: "Date range cannot exceed 1 year" }, { status: 400 });
  }

  try {
    const pdfBuffer = await generateEvidencePack(
      session.orgId,
      frameworkStr as Framework,
      from,
      to,
    );

    // audit-23: Build the filename from the parsed (and therefore safe) Date objects
    // rather than the raw user-supplied query strings.  Using fromStr/toStr directly
    // could allow header injection via characters that Date parsing happens to accept
    // (e.g. spaces, quotes, semicolons in some runtimes).  ISO 8601 date strings
    // contain only digits and hyphens, which are safe in Content-Disposition filenames.
    const fromSafe = from.toISOString().slice(0, 10); // YYYY-MM-DD
    const toSafe = to.toISOString().slice(0, 10);     // YYYY-MM-DD
    const filename = `scantient-evidence-${frameworkStr}-${fromSafe}-to-${toSafe}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    logApiError(err, {
      route: "/api/reports/evidence",
      method: "GET",
      orgId: session.orgId,
      userId: session.id,
      statusCode: 500,
    });
    return NextResponse.json({ error: "Failed to generate evidence pack" }, { status: 500 });
  }
}
