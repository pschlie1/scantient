import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateComplianceReport } from "@/lib/pdf-report";
import { getOrgLimits } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limits = await getOrgLimits(session.orgId);
  if (!["PRO", "ENTERPRISE"].includes(limits.tier)) {
    return NextResponse.json(
      { error: "PDF reports are available on Pro and Enterprise plans" },
      { status: 403 },
    );
  }

  try {
    const pdfBuffer = await generateComplianceReport(session.orgId);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="scantient-compliance-report.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
