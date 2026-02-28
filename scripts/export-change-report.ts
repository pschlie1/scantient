import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getChangeAuditReport } from "../src/lib/wave3-reporting";

function arg(name: string): string | null {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split("=").slice(1).join("=") : null;
}

async function main() {
  const orgId = arg("org");
  if (!orgId) throw new Error("Missing --org=<orgId>");

  const from = arg("from") ? new Date(arg("from")!) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = arg("to") ? new Date(arg("to")!) : new Date();
  const out = resolve(arg("out") ?? `./tmp/change-report-${orgId}.json`);

  const report = await getChangeAuditReport(orgId, { from, to });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`Change report written to ${out}`);
}

main().catch((err) => {
  console.error("Failed to export change report:", err);
  process.exit(1);
});
