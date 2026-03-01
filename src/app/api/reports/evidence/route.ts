import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateEvidencePack } from "@/lib/pdf-report";
import { getOrgLimits } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const VALID_FRAMEWORKS = ["soc2", "iso27001", "nist"] as const;
type Framework = (typeof VALID_FRAMEWORKS)[number];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!["PRO", "ENTERPRISE"].includes(limits.tier)) {
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

  try {
    const pdfBuffer = await generateEvidencePack(
      session.orgId,
      frameworkStr as Framework,
      from,
      to,
    );

    const filename = `scantient-evidence-${frameworkStr}-${fromStr}-to-${toStr}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Evidence pack generation error:", err);
    return NextResponse.json({ error: "Failed to generate evidence pack" }, { status: 500 });
  }
}
