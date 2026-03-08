import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Continuous Compliance Monitoring for AI-Generated Applications | Scantient",
  description:
    "How to maintain SOC 2, ISO 27001, and NIST CSF compliance when your organization deploys AI-generated applications. Automated monitoring for IT leaders.",
};

const frameworks = [
  {
    name: "SOC 2 Type II",
    controls: [
      { id: "CC6.1", desc: "Logical access security: Scantient detects exposed authentication endpoints and client-side auth bypass patterns" },
      { id: "CC6.6", desc: "System boundary protection: continuous monitoring of security headers, CORS, and network exposure" },
      { id: "CC7.2", desc: "Monitoring for anomalies: automated alerts on configuration drift, new vulnerabilities, and availability changes" },
      { id: "CC8.1", desc: "Change management: scan-on-deploy detection identifies when apps change and re-evaluates security posture" },
    ],
  },
  {
    name: "ISO 27001",
    controls: [
      { id: "A.8.9", desc: "Configuration management: continuous validation of security configurations across all monitored applications" },
      { id: "A.8.8", desc: "Technical vulnerability management: automated discovery of known vulnerabilities in dependencies and configurations" },
      { id: "A.5.23", desc: "Information security for cloud services: monitoring of cloud-deployed AI applications for security compliance" },
    ],
  },
  {
    name: "NIST CSF",
    controls: [
      { id: "ID.AM", desc: "Asset management: maintain a current inventory of all AI-generated applications with security posture scores" },
      { id: "PR.AC", desc: "Access control: verify authentication and authorization implementations across your app portfolio" },
      { id: "DE.CM", desc: "Continuous monitoring: automated security monitoring with configurable scan intervals and alert thresholds" },
    ],
  },
];

export default function CompliancePage() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-muted">Compliance</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Continuous Compliance Monitoring for AI-Generated Applications
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          Your compliance obligations don&apos;t have a carve-out for AI-generated code. SOC 2, ISO 27001, HIPAA, NIST: every framework requires you to monitor, manage, and secure the applications your organization deploys. When those applications are built by AI and deployed by non-developers, traditional compliance workflows break down.
        </p>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">The AI App Compliance Challenge</h2>
          <div className="mt-6 space-y-4 leading-relaxed text-body">
            <p>
              Traditional compliance relies on controlled development processes: code review, change management, security testing in CI/CD, documented deployment procedures. AI-generated applications bypass every one of these controls.
            </p>
            <p>
              An employee builds and deploys an application in an afternoon without creating a ticket, committing to a repository, or passing through a security gate. The app processes data, serves customers, and creates compliance obligations, all without IT&apos;s knowledge.
            </p>
            <p>
              When your auditor asks &ldquo;How do you govern AI-generated applications?&rdquo; you need an answer that goes beyond &ldquo;we have a policy.&rdquo; You need evidence of continuous monitoring, documented controls, and remediation tracking.
            </p>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">Framework Mapping</h2>
          <p className="mt-4 text-muted">
            Scantient&apos;s continuous monitoring maps directly to controls across major compliance frameworks.
          </p>

          <div className="mt-8 space-y-12">
            {frameworks.map((fw) => (
              <div key={fw.name}>
                <h3 className="text-lg font-semibold">{fw.name}</h3>
                <div className="mt-4 space-y-3">
                  {fw.controls.map((c) => (
                    <div key={c.id} className="flex gap-3 rounded-xl border p-4">
                      <span className="shrink-0 rounded bg-surface-raised px-2 py-0.5 text-xs font-mono font-medium text-body">{c.id}</span>
                      <p className="text-sm text-body">{c.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">Audit-Ready Reporting</h2>
          <div className="mt-6 space-y-4 leading-relaxed text-body">
            <p>
              Scantient generates weekly and on-demand compliance reports that document the security posture of every AI-generated application in your organization. Each report includes:
            </p>
            <ul className="ml-4 space-y-2">
              <li className="flex items-start gap-2"><span className="mt-1 text-success">✓</span> Complete application inventory with security scores</li>
              <li className="flex items-start gap-2"><span className="mt-1 text-success">✓</span> Open findings with severity classifications</li>
              <li className="flex items-start gap-2"><span className="mt-1 text-success">✓</span> Remediation tracking with timestamps</li>
              <li className="flex items-start gap-2"><span className="mt-1 text-success">✓</span> Control mapping to SOC 2, ISO 27001, and NIST CSF</li>
              <li className="flex items-start gap-2"><span className="mt-1 text-success">✓</span> Historical trend data showing security posture over time</li>
              <li className="flex items-start gap-2"><span className="mt-1 text-success">✓</span> PDF export for auditor submission</li>
            </ul>
          </div>
        </div>

        <div className="mt-20 rounded-2xl bg-surface-raised p-8 text-center">
          <h2 className="text-2xl font-bold">Be audit-ready, always</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted">
            Scantient provides the continuous monitoring and documentation your auditors require, automatically. Generate your first compliance report in minutes.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-primary px-8 py-3 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
          >
            Get started
          </Link>
        </div>

        <div className="mt-12 flex gap-4 text-sm">
          <Link href="/vibe-coding-risks" className="text-muted hover:text-heading transition-colors">← Vibe Coding Risks</Link>
          <span className="text-muted">|</span>
          <Link href="/security-checklist" className="text-muted hover:text-heading transition-colors">Security Checklist →</Link>
        </div>
      </article>

    </>
  );
}
