/**
 * Compliance score calculation.
 * Maps finding codes to compliance framework controls (SOC2, NIST, ISO27001).
 */

export const COMPLIANCE_MAPPING: Record<
  string,
  { soc2?: string[]; nist?: string[]; iso27001?: string[] }
> = {
  // Security headers
  MISSING_CSP: { soc2: ["CC6.1", "CC6.7"], nist: ["SI-10", "SI-15"], iso27001: ["A.14.2.5"] },
  MISSING_HSTS: { soc2: ["CC6.1"], nist: ["SC-8"], iso27001: ["A.10.1.1"] },
  MISSING_X_FRAME_OPTIONS: { soc2: ["CC6.1"], nist: ["SC-8"], iso27001: ["A.14.1.2"] },
  MISSING_X_CONTENT_TYPE: { soc2: ["CC6.1"], nist: ["SI-3"], iso27001: ["A.14.2.5"] },
  MISSING_REFERRER_POLICY: { soc2: ["CC6.1"], nist: ["SI-12"], iso27001: ["A.14.2.5"] },
  MISSING_PERMISSIONS_POLICY: { soc2: ["CC6.6"], nist: ["AC-3"], iso27001: ["A.9.4.1"] },
  // Cookies
  INSECURE_COOKIE: {
    soc2: ["CC6.1", "CC6.7"],
    nist: ["SC-8", "IA-5"],
    iso27001: ["A.10.1.1"],
  },
  COOKIE_NO_HTTPONLY: { soc2: ["CC6.1"], nist: ["SC-8"], iso27001: ["A.14.2.5"] },
  COOKIE_NO_SAMESITE: { soc2: ["CC6.1"], nist: ["SC-8"], iso27001: ["A.14.2.5"] },
  // Keys
  EXPOSED_API_KEY: {
    soc2: ["CC6.1", "CC6.3", "CC9.2"],
    nist: ["IA-5", "SC-12"],
    iso27001: ["A.10.1.1", "A.9.2.4"],
  },
  EXPOSED_SECRET: { soc2: ["CC6.1", "CC6.3"], nist: ["IA-5"], iso27001: ["A.10.1.1"] },
  // Auth
  CLIENT_SIDE_AUTH_BYPASS: {
    soc2: ["CC6.2", "CC6.3"],
    nist: ["AC-2", "IA-2"],
    iso27001: ["A.9.4.2"],
  },
  FORM_NO_CSRF: { soc2: ["CC6.1"], nist: ["SI-10"], iso27001: ["A.14.2.5"] },
  // SSL
  SSL_CERT_EXPIRING: { soc2: ["CC6.7"], nist: ["SC-8", "SC-17"], iso27001: ["A.10.1.1"] },
  SSL_CERT_EXPIRED: {
    soc2: ["CC6.7", "A1.2"],
    nist: ["SC-8", "SC-17"],
    iso27001: ["A.10.1.1"],
  },
  INSECURE_CONTENT: { soc2: ["CC6.1"], nist: ["SC-8"], iso27001: ["A.10.1.1"] },
  // Info disclosure
  SERVER_HEADER_EXPOSED: {
    soc2: ["CC6.1"],
    nist: ["SI-12", "CM-7"],
    iso27001: ["A.14.2.5"],
  },
  X_POWERED_BY: { soc2: ["CC6.1"], nist: ["CM-7"], iso27001: ["A.14.2.5"] },
  // Availability
  UPTIME_ERROR: {
    soc2: ["A1.1", "A1.2"],
    nist: ["CP-10", "SI-13"],
    iso27001: ["A.17.2.1"],
  },
  UPTIME_SLOW: { soc2: ["A1.2"], nist: ["CP-10"], iso27001: ["A.17.2.1"] },
};

export type ComplianceFramework = "soc2" | "nist" | "iso27001";

export interface FrameworkScore {
  score: number; // 0–100
  status: "compliant" | "at_risk" | "non_compliant";
  findings: number; // count of open findings affecting this framework
  controls_passed: number;
  controls_total: number;
}

export interface ComplianceResult {
  soc2: FrameworkScore;
  nist: FrameworkScore;
  iso27001: FrameworkScore;
  topImpactingFindings: TopImpactingFinding[];
}

export interface TopImpactingFinding {
  code: string;
  title: string;
  severity: string;
  controlsImpacted: number; // total controls across all frameworks this finding violates
}

function getStatus(score: number): "compliant" | "at_risk" | "non_compliant" {
  if (score >= 80) return "compliant";
  if (score >= 50) return "at_risk";
  return "non_compliant";
}

/** Count controls impacted by a finding code across all frameworks */
export function countControlsImpacted(code: string): number {
  const mapping = COMPLIANCE_MAPPING[code];
  if (!mapping) return 0;
  return (
    (mapping.soc2?.length ?? 0) +
    (mapping.nist?.length ?? 0) +
    (mapping.iso27001?.length ?? 0)
  );
}

export function calculateComplianceScore(
  openFindings: Array<{ code: string; title: string; severity: string }>,
): ComplianceResult {
  // Build sets of violated controls per framework
  const violatedSoc2 = new Set<string>();
  const violatedNist = new Set<string>();
  const violatedIso = new Set<string>();

  // Build map of all unique controls per framework
  const allSoc2 = new Set<string>();
  const allNist = new Set<string>();
  const allIso = new Set<string>();

  for (const [, mapping] of Object.entries(COMPLIANCE_MAPPING)) {
    mapping.soc2?.forEach((c) => allSoc2.add(c));
    mapping.nist?.forEach((c) => allNist.add(c));
    mapping.iso27001?.forEach((c) => allIso.add(c));
  }

  // Track which finding codes are open
  const openCodes = new Set(openFindings.map((f) => f.code));

  for (const code of openCodes) {
    const mapping = COMPLIANCE_MAPPING[code];
    if (!mapping) continue;
    mapping.soc2?.forEach((c) => violatedSoc2.add(c));
    mapping.nist?.forEach((c) => violatedNist.add(c));
    mapping.iso27001?.forEach((c) => violatedIso.add(c));
  }

  // Count open findings per framework
  const findingsAffectingSoc2 = openFindings.filter((f) => COMPLIANCE_MAPPING[f.code]?.soc2?.length).length;
  const findingsAffectingNist = openFindings.filter((f) => COMPLIANCE_MAPPING[f.code]?.nist?.length).length;
  const findingsAffectingIso = openFindings.filter((f) => COMPLIANCE_MAPPING[f.code]?.iso27001?.length).length;

  function buildScore(
    allControls: Set<string>,
    violated: Set<string>,
    findingCount: number,
  ): FrameworkScore {
    const total = allControls.size;
    const passed = total - violated.size;
    const score = total === 0 ? 100 : Math.round((passed / total) * 100);
    return {
      score,
      status: getStatus(score),
      findings: findingCount,
      controls_passed: passed,
      controls_total: total,
    };
  }

  // Top 5 impacting findings: sorted by number of controls they violate
  const dedupedFindings = Array.from(
    new Map(openFindings.map((f) => [f.code, f])).values(),
  );
  const topImpactingFindings: TopImpactingFinding[] = dedupedFindings
    .map((f) => ({
      code: f.code,
      title: f.title,
      severity: f.severity,
      controlsImpacted: countControlsImpacted(f.code),
    }))
    .filter((f) => f.controlsImpacted > 0)
    .sort((a, b) => b.controlsImpacted - a.controlsImpacted)
    .slice(0, 5);

  return {
    soc2: buildScore(allSoc2, violatedSoc2, findingsAffectingSoc2),
    nist: buildScore(allNist, violatedNist, findingsAffectingNist),
    iso27001: buildScore(allIso, violatedIso, findingsAffectingIso),
    topImpactingFindings,
  };
}
