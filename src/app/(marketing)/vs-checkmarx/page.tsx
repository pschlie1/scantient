"use client";
import Link from "next/link";
import Footer from "@/components/footer";
import { ThemeToggle } from "@/components/theme-toggle";

export default function VsCheckmarxPage() {
  return (
    <div className="bg-alabaster-grey-50 dark:bg-ink-black-950 transition-colors">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-alabaster-grey-200/60 dark:border-ink-black-800/60 transition-colors" style={{ background: "rgba(243,243,241,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <style>{`
          @media (prefers-color-scheme: dark) {
            nav {
              background: rgba(8,18,27,0.85) !important;
            }
          }
        `}</style>
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-black-900 dark:bg-prussian-blue-600 transition-colors">
              <span className="text-sm font-bold text-white">V</span>
            </div>
            <span className="font-bold tracking-tight text-ink-black-900 dark:text-alabaster-grey-50 transition-colors">Scantient</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="hidden text-sm font-medium text-dusty-denim-700 dark:text-dusty-denim-500 transition-colors hover:text-ink-black-950 dark:hover:text-alabaster-grey-100 sm:block">Pricing</Link>
            <Link href="/login" className="text-sm font-medium text-dusty-denim-700 dark:text-dusty-denim-500 transition-colors hover:text-ink-black-950 dark:hover:text-alabaster-grey-100">Sign in</Link>
            <ThemeToggle />
            <Link
              href="/signup"
              className="rounded-full bg-prussian-blue-600 dark:bg-prussian-blue-500 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-prussian-blue-700 dark:hover:bg-prussian-blue-600 hover:shadow-lg active:scale-95"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-24 pt-24 sm:pb-32 sm:pt-32" style={{ background: "radial-gradient(ellipse at 50% 0%, #ebf2f9 0%, #f3f3f1 70%)" }}>
        <div className="mx-auto max-w-[1200px] text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700 border border-blue-300">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              SCANTIENT VS CHECKMARX
            </span>
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-black-950 dark:text-alabaster-grey-50 sm:text-6xl lg:text-[3.75rem] transition-colors">
            External Security Checks: <br />
            <span className="text-prussian-blue-600 dark:text-prussian-blue-400 transition-colors">No code analysis. No SDK. 60 seconds.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-[600px] text-lg leading-relaxed text-dusty-denim-700 dark:text-dusty-denim-500 transition-colors">
            Checkmarx does SAST (code analysis). Scantient checks your deployed app. Different tools for different jobs.
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
                <th className="px-6 py-4 text-left text-sm font-bold text-ink-black-950 dark:text-alabaster-grey-50">Checkmarx</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-prussian-blue-600 dark:text-prussian-blue-400">Scantient</th>
              </tr>
            </thead>
            <tbody>
              {[
                { feature: "Scanning approach", checkmarx: "SAST (static code analysis)", scantient: "External (live app monitoring)" },
                { feature: "Requires code", checkmarx: "Yes (analyzes source code)", scantient: "No (URL paste only)" },
                { feature: "What it checks", checkmarx: "Vulnerabilities in source code", scantient: "20+ runtime security checks" },
                { feature: "Setup complexity", checkmarx: "High (IDE, CI/CD integration)", scantient: "Low (2 minutes, paste URL)" },
                { feature: "Time to results", checkmarx: "Minutes to hours", scantient: "60 seconds" },
                { feature: "False positives", checkmarx: "High (many code patterns flagged)", scantient: "Low (only real findings)" },
                { feature: "Requires SDK?", checkmarx: "Yes", scantient: "No" },
                { feature: "Pricing model", checkmarx: "Enterprise (seat-based)", scantient: "$399/mo team plan" },
                { feature: "Developer overhead", checkmarx: "High (needs code integration)", scantient: "Zero (external scan)" },
              ].map((row) => (
                <tr key={row.feature} className="border-b border-alabaster-grey-100 dark:border-ink-black-800">
                  <td className="px-6 py-4 text-sm font-semibold text-ink-black-900 dark:text-alabaster-grey-50">{row.feature}</td>
                  <td className="px-6 py-4 text-sm text-dusty-denim-600 dark:text-dusty-denim-500">{row.checkmarx}</td>
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
              <h3 className="text-xl font-bold text-ink-black-950 dark:text-alabaster-grey-50 mb-6">When Checkmarx is better</h3>
              <ul className="space-y-3">
                {[
                  "You're analyzing source code for security flaws",
                  "You need SAST (static application security testing)",
                  "You want to catch vulnerabilities at code-review time",
                  "You're a large enterprise with dedicated security teams",
                  "You need deep code-level reporting and custom rules",
                  "You want shift-left security in CI/CD",
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
                  "You need quick security audits of live apps",
                  "You want zero developer overhead (external scan)",
                  "You need to check deployed app for runtime issues",
                  "You want compliance reports for auditors",
                  "You're a SMB or startup without huge security budgets",
                  "You want instant results (60 seconds) without setup",
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
        <h2 className="mb-12 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 dark:text-alabaster-grey-50 sm:text-4xl">Real scenario: You want to verify app security</h2>
        
        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-alabaster-grey-200 dark:border-ink-black-800 bg-white dark:bg-ink-black-900 p-8">
            <h3 className="text-lg font-bold text-ink-black-950 dark:text-alabaster-grey-50 mb-4">Checkmarx says:</h3>
            <ul className="space-y-2">
              {[
                "Found 42 issues in source code",
                "SQL injection risk in line 234",
                "XSS vulnerability in user input handler",
                "Weak cryptography in auth module",
              ].map((item) => (
                <li key={item} className="text-sm text-dusty-denim-700 dark:text-dusty-denim-500">{item}</li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-dusty-denim-500 dark:text-dusty-denim-600">Setup: Days. Setup overhead: High (developers must integrate). Results: Code-level findings.</p>
          </div>

          <div className="rounded-2xl border-2 border-prussian-blue-600 dark:border-prussian-blue-400 bg-white dark:bg-ink-black-900 p-8">
            <h3 className="text-lg font-bold text-prussian-blue-600 dark:text-prussian-blue-400 mb-4">Scantient checks:</h3>
            <ul className="space-y-2">
              {[
                "✓ Is your app actually vulnerable at runtime?",
                "✓ Are secrets exposed in the deployed app?",
                "✓ Missing security headers?",
                "✓ Performance degradation?",
              ].map((item) => (
                <li key={item} className="text-sm text-dusty-denim-700 dark:text-dusty-denim-500">{item}</li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-prussian-blue-600 dark:text-prussian-blue-400 font-semibold">Setup: 2 min. Setup overhead: Zero. Results: Deployed app security posture.</p>
          </div>
        </div>

        <p className="mt-8 text-center text-dusty-denim-700 dark:text-dusty-denim-500 max-w-2xl mx-auto">
          Checkmarx finds potential issues in code. Scantient checks what's actually vulnerable in your live app. Both are valuable — they're checking different things.
        </p>
      </section>

      {/* The Gap */}
      <section className="border-y border-alabaster-grey-200 dark:border-ink-black-800 bg-white dark:bg-ink-black-900 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-[800px] text-center">
          <h2 className="text-3xl font-bold text-ink-black-950 dark:text-alabaster-grey-50 mb-6">The post-deploy gap</h2>
          <p className="text-dusty-denim-700 dark:text-dusty-denim-500 mb-8">
            Checkmarx scans code before deployment. But what about after? Configuration issues, runtime secrets, performance degradation — these show up <em>in production</em>.
          </p>
          <p className="text-dusty-denim-700 dark:text-dusty-denim-500">
            Scantient fills this gap with continuous post-deploy monitoring. Checkmarx + Scantient = complete security coverage.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink-black-950 dark:bg-ink-black-900 px-6 py-24 text-center sm:py-32">
        <h2 className="text-3xl font-extrabold tracking-[-0.02em] text-white sm:text-4xl">Check your live app security in 60 seconds</h2>
        <p className="mx-auto mt-6 max-w-xl text-alabaster-grey-200">
          Scantient Pro: Continuous monitoring for $399/mo. No setup. No developers. Just results.
        </p>
        <Link
          href="/signup?plan=pro"
          className="mt-10 inline-block rounded-lg bg-white dark:bg-prussian-blue-600 px-8 py-3.5 text-sm font-semibold text-ink-black-950 dark:text-white transition-all hover:bg-alabaster-grey-100 dark:hover:bg-prussian-blue-700 hover:shadow-lg active:scale-95"
        >
          Start Scantient Pro trial
        </Link>
      </section>

      <Footer />
    </div>
  );
}
