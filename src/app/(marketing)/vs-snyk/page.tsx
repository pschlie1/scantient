"use client";
import Link from "next/link";

export default function VsSnyKPage() {
  return (
    <div className="bg-alabaster-grey-50 dark:bg-ink-black-950 transition-colors">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-24 pt-24 sm:pb-32 sm:pt-32" style={{ background: "radial-gradient(ellipse at 50% 0%, #ebf2f9 0%, #f3f3f1 70%)" }}>
        <div className="mx-auto max-w-[1200px] text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-3 py-1 text-xs font-bold text-info border border-info/30">
              <span className="h-2 w-2 rounded-full bg-info animate-pulse" />
              SCANTIENT VS SNYK
            </span>
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-black-950 dark:text-alabaster-grey-50 sm:text-6xl lg:text-[3.75rem] transition-colors">
            Beyond Dependency Scanning: <br />
            <span className="text-prussian-blue-600 dark:text-prussian-blue-400 transition-colors">The post-deploy security check you're missing</span>
          </h1>
          <p className="mx-auto mt-8 max-w-[600px] text-lg leading-relaxed text-dusty-denim-700 dark:text-dusty-denim-500 transition-colors">
            Snyk checks your dependencies. Scantient checks your deployed app. Both matter. Here's how they complement each other.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup?plan=pro"
              className="rounded-lg bg-prussian-blue-600 dark:bg-prussian-blue-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-prussian-blue-600/25 dark:shadow-prussian-blue-500/20 transition-all hover:bg-prussian-blue-700 dark:hover:bg-prussian-blue-600 hover:shadow-xl hover:shadow-prussian-blue-700/40 dark:hover:shadow-prussian-blue-600/40 active:scale-95"
            >
              Try Scantient Pro
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-alabaster-grey-200 dark:border-ink-black-800 bg-white dark:bg-ink-black-900 px-8 py-3.5 text-sm font-semibold text-dusty-denim-700 dark:text-dusty-denim-100 transition-all hover:border-alabaster-grey-300 dark:hover:border-ink-black-700 hover:bg-alabaster-grey-50 dark:hover:bg-ink-black-800 active:scale-95"
            >
              Back to landing
            </Link>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <h2 className="mb-16 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 dark:text-alabaster-grey-50 sm:text-4xl">Head-to-head comparison</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-alabaster-grey-200 dark:border-ink-black-800">
                <th className="px-6 py-4 text-left text-sm font-bold text-ink-black-950 dark:text-alabaster-grey-50">Feature</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-ink-black-950 dark:text-alabaster-grey-50">Snyk</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-prussian-blue-600 dark:text-prussian-blue-400">Scantient</th>
              </tr>
            </thead>
            <tbody>
              {[
                { feature: "Primary focus", snyk: "Dependency vulnerabilities", scantient: "Post-deploy security posture" },
                { feature: "Scan trigger", snyk: "Code push / Package changes", scantient: "URL (external scan)" },
                { feature: "What it checks", snyk: "package.json, npm/yarn deps", scantient: "20+ checks (secrets, headers, endpoints, perf, etc.)" },
                { feature: "Speed", snyk: "Minutes (build-time)", scantient: "60 seconds" },
                { feature: "Requires SDK?", snyk: "Yes (CI/CD integration)", scantient: "No (external scan)" },
                { feature: "Compliance reports", snyk: "Limited", scantient: "Built-in monthly PDF" },
                { feature: "Team plan price", snyk: "$400/mo+", scantient: "$399/mo (covers 20+ checks)" },
                { feature: "Setup effort", snyk: "High (CI/CD integration)", scantient: "Low (paste URL)" },
              ].map((row) => (
                <tr key={row.feature} className="border-b border-alabaster-grey-100 dark:border-ink-black-800">
                  <td className="px-6 py-4 text-sm font-semibold text-ink-black-900 dark:text-alabaster-grey-50">{row.feature}</td>
                  <td className="px-6 py-4 text-sm text-dusty-denim-600 dark:text-dusty-denim-500">{row.snyk}</td>
                  <td className="px-6 py-4 text-sm text-dusty-denim-600 dark:text-dusty-denim-500 font-semibold">{row.scantient}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* When to choose */}
      <section className="border-y border-alabaster-grey-200 dark:border-ink-black-800 bg-white dark:bg-ink-black-900 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <h3 className="text-xl font-bold text-ink-black-950 dark:text-alabaster-grey-50 mb-6">When Snyk is better</h3>
              <ul className="space-y-3">
                {[
                  "You're paranoid about dependencies (rightfully so)",
                  "You want to shift-left and catch vulns at code-review time",
                  "You need deep package-level reporting and SBOM generation",
                  "You're in a regulated industry obsessed with supply-chain risk",
                  "You have a mature CI/CD pipeline that needs security integration",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-dusty-denim-700 dark:text-dusty-denim-500">
                    <span className="text-prussian-blue-600 dark:text-prussian-blue-400 mt-1">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-bold text-prussian-blue-600 dark:text-prussian-blue-400 mb-6">When Scantient is better</h3>
              <ul className="space-y-3">
                {[
                  "You need a quick security audit of your live app",
                  "You want to catch secrets, headers, endpoints, performance issues",
                  "You want compliance reports (auditors love it)",
                  "You want fast scans without slowing down your deploy pipeline",
                  "You don't want to manage 3 different security tools",
                  "You need continuous post-deploy monitoring",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-dusty-denim-700 dark:text-dusty-denim-500">
                    <span className="text-prussian-blue-600 dark:text-prussian-blue-400 mt-1">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Real Example */}
      <section className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <h2 className="mb-12 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 dark:text-alabaster-grey-50 sm:text-4xl">Real scenario: React 16 app with no vulnerable dependencies</h2>
        
        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-alabaster-grey-200 dark:border-ink-black-800 bg-white dark:bg-ink-black-900 p-8">
            <h3 className="text-lg font-bold text-ink-black-950 dark:text-alabaster-grey-50 mb-4">Snyk says:</h3>
            <ul className="space-y-2">
              {[
                "✓ React 16.14.0 — No vulnerabilities",
                "✓ All dependencies clean",
                "Status: CLEAN",
              ].map((item) => (
                <li key={item} className="text-sm text-dusty-denim-700 dark:text-dusty-denim-500">{item}</li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-dusty-denim-500 dark:text-dusty-denim-600">Snyk is happy. Your dependencies are safe.</p>
          </div>

          <div className="rounded-2xl border-2 border-prussian-blue-600 dark:border-prussian-blue-400 bg-white dark:bg-ink-black-900 p-8">
            <h3 className="text-lg font-bold text-prussian-blue-600 dark:text-prussian-blue-400 mb-4">Scantient finds:</h3>
            <ul className="space-y-2">
              {[
                "✗ API key hardcoded in JavaScript chunk",
                "✗ Missing CSP header (allows inline scripts)",
                "✗ Performance regression (2s → 5s load time)",
                "✗ SSL cert expiring in 7 days",
              ].map((item) => (
                <li key={item} className="text-sm text-dusty-denim-700 dark:text-dusty-denim-500">{item}</li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-prussian-blue-600 dark:text-prussian-blue-400 font-semibold">Snyk: Clean. Scantient: 4 critical issues at runtime.</p>
          </div>
        </div>

        <p className="mt-8 text-center text-dusty-denim-700 dark:text-dusty-denim-500 max-w-2xl mx-auto">
          Both are checking security, just at different layers. Snyk checks your code before it ships. Scantient checks what's actually running.
        </p>
      </section>

      {/* Ecosystem */}
      <section className="border-y border-alabaster-grey-200 dark:border-ink-black-800 bg-white dark:bg-ink-black-900 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-[800px] text-center">
          <h2 className="text-3xl font-bold text-ink-black-950 dark:text-alabaster-grey-50 mb-6">The ideal security ecosystem</h2>
          <p className="text-dusty-denim-700 dark:text-dusty-denim-500 mb-8">
            You probably need <strong>both</strong> for complete coverage:
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-alabaster-grey-200 dark:border-ink-black-800 p-6">
              <p className="font-semibold text-ink-black-950 dark:text-alabaster-grey-50 mb-2">Snyk in CI/CD</p>
              <p className="text-sm text-dusty-denim-600 dark:text-dusty-denim-500">Catch vulnerable dependencies before deployment</p>
            </div>
            <div className="rounded-xl border-2 border-prussian-blue-600 dark:border-prussian-blue-400 p-6">
              <p className="font-semibold text-prussian-blue-600 dark:text-prussian-blue-400 mb-2">Scantient on deploy</p>
              <p className="text-sm text-dusty-denim-600 dark:text-dusty-denim-500">Catch misconfigurations, secrets, performance issues after deployment</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink-black-950 dark:bg-ink-black-900 px-6 py-24 text-center sm:py-32">
        <h2 className="text-3xl font-extrabold tracking-[-0.02em] text-white sm:text-4xl">Close the post-deploy security gap</h2>
        <p className="mx-auto mt-6 max-w-xl text-alabaster-grey-200">
          Scantient Pro: $399/mo. Continuous verification. Audit trails. Compliance reports.
        </p>
        <Link
          href="/signup?plan=pro"
          className="mt-10 inline-block rounded-lg bg-white dark:bg-prussian-blue-600 px-8 py-3.5 text-sm font-semibold text-ink-black-950 dark:text-white transition-all hover:bg-alabaster-grey-100 dark:hover:bg-prussian-blue-700 hover:shadow-lg active:scale-95"
        >
          Start Scantient Pro trial
        </Link>
      </section>

    </div>
  );
}
