"use client";
import Image from "next/image";
import Link from "next/link";
import Footer from "@/components/footer";

type Check = {
  icon: string;
  title: string;
  outcome?: string;
  desc: string;
};

const checks: Check[] = [
  { icon: "🔑", title: "Exposed API Keys", outcome: "Your outcome: No stolen credentials in the wild.", desc: "Scantient detected $50K in stolen Stripe keys in 30 seconds. We check OpenAI, Stripe, Supabase, Twilio, SendGrid, AWS keys, and 20+ other services." },
  { icon: "🛡️", title: "Missing Security Headers", outcome: "Your outcome: Users protected from XSS, clickjacking, injection attacks.", desc: "One missing header = your data exposed. We verify CSP, HSTS, X-Frame-Options, X-Content-Type, Referrer-Policy." },
  { icon: "🔓", title: "Auth Bypass Vulnerabilities", outcome: "Your outcome: No $500K breach from a 'check role on frontend' mistake.", desc: "We detect hardcoded admin checks, fake auth gates, and role checks visible in client code." },
  { icon: "📦", title: "Hardcoded Secrets in JavaScript", outcome: "Your outcome: Database passwords not in your JavaScript bundle.", desc: "Scantient finds secrets hardcoded in JS chunks, config files, git history, and comments. (Curse you, Cursor auto-generation.)" },
  { icon: "⚙️", title: "Exposed Debug Endpoints", outcome: "Your outcome: Attackers don't find .env, .git/HEAD, /api/admin, phpinfo.", desc: "Attackers check for debug endpoints within 2 minutes of finding your site. We check first." },
  { icon: "🚀", title: "Performance & Uptime Alerts", outcome: "Your outcome: Know about outages before your CEO calls.", desc: "We baseline your response time and alert if it suddenly takes 8 seconds to load. Get notified of 500 errors within hours, not after customers complain." },
  { icon: "🔗", title: "Malicious External Scripts", outcome: "Your outcome: No backdoors from compromised CDNs.", desc: "Every third-party script is a potential breach. We detect unencrypted loads, suspicious data URIs, and supply chain compromises." },
  { icon: "📋", title: "Form & API Security Flaws", outcome: "Your outcome: Forms submit to YOUR domain, not attacker's.", desc: "We catch forms submitting to wrong domains, missing CSRF tokens, unencrypted API calls — the stuff compliance auditors find." },
  { icon: "🌐", title: "CORS & API Exposure Issues", outcome: "Your outcome: Competitors can't read your customer data via API.", desc: "One misconfigured CORS header = your API exposed. We detect overpermissive access." },
  { icon: "🔐", title: "SSL Certificate Expiry", outcome: "Your outcome: Your site never goes dark due to expired SSL.", desc: "A lapsed certificate = 100% downtime. We alert 30, 14, and 7 days before expiry." },
  { icon: "📡", title: "Subdomain Takeover Risks", outcome: "Your outcome: Forgotten DNS records aren't free subdomains for attackers.", desc: "We detect DNS misconfigurations, dangling CNAME records, and abandoned subdomains." },
  { icon: "⏱️", title: "Load Time Regression Detection", outcome: "Your outcome: Catch performance degradation before users bounce.", desc: "Baseline your app's speed. If it suddenly takes 8 seconds to load, you know before your users do." },
  { icon: "🍪", title: "Cookie Security Issues", outcome: "Your outcome: Session cookies protected from theft and XSS.", desc: "We verify HttpOnly, Secure, SameSite flags on all cookies." },
  { icon: "🔄", title: "Content Change Detection", outcome: "Your outcome: Know when your site's HTML changed unexpectedly.", desc: "Baseline your app. If an attacker injects content or modifiers change things, we alert you." },
  { icon: "🛡️", title: "Dependency Vulnerability Scanning", outcome: "Your outcome: No known vulnerable libraries in your app.", desc: "We scan package.json, npm/yarn lock files for outdated / vulnerable dependencies." },
  { icon: "📊", title: "Unencrypted Data Transmission", outcome: "Your outcome: All data in transit is encrypted (HTTPS).", desc: "We verify no HTTP resources are mixed with HTTPS." },
  { icon: "🤖", title: "Bot Detection & Abuse Protection", outcome: "Your outcome: Know if your APIs are being scraped or abused.", desc: "We detect unusual request patterns that indicate bot activity." },
  { icon: "🎯", title: "Pixel Tracking & Privacy Violations", outcome: "Your outcome: Track all third-party pixels and analytics tools.", desc: "Know which tracking tools are on your site, ensure GDPR/privacy compliance." },
  { icon: "🔧", title: "Infrastructure Misconfiguration", outcome: "Your outcome: S3 buckets, databases, storage not open to the internet.", desc: "We detect public S3 buckets, exposed database ports, and cloud storage misconfigurations." },
  { icon: "📱", title: "Mobile & Responsive Security", outcome: "Your outcome: Your app is secure on mobile, tablet, and desktop.", desc: "We scan security across all device breakpoints." },
];

const socialProof = [
  {
    icon: "🛡️",
    stat: "$50K+",
    label: "In leaked credentials found",
    detail: "Real founding story: We found $50K in stolen API keys before the attacker could use them.",
    href: "#features",
  },
  {
    icon: "⚡",
    stat: "<60 sec",
    label: "From URL to security audit",
    detail: "Paste your site URL and get results faster than you can make coffee. No waiting, no setup.",
    href: "/score",
  },
  {
    icon: "🔐",
    stat: "20",
    label: "Security checks every scan",
    detail: "API keys, exposed admin panels, broken auth, SSL certs, performance, bot detection, and more. Every single time. Automated.",
    href: "#features",
  },
];

const integrations = {
  live: [
    { name: "Jira", logo: "/logos/jira.svg" },
    { name: "GitHub", logo: "/logos/github.svg" },
    { name: "Microsoft Teams", logo: "/logos/teams.svg" },
    { name: "PagerDuty", logo: "/logos/pagerduty.svg" },
    { name: "Okta", logo: "/logos/okta.svg" },
    { name: "Azure AD", logo: "/logos/azure.svg" },
    { name: "Google Workspace", logo: "/logos/google.svg" },
    { name: "MCP", logo: "/logos/mcp.svg" },
  ],
  soon: [
    { name: "Slack", logo: "/logos/slack.svg" },
    { name: "Vercel", logo: "/logos/vercel.svg" },
    { name: "Netlify", logo: "/logos/netlify.svg" },
    { name: "Datadog", logo: "/logos/datadog.svg" },
    { name: "Linear", logo: "/logos/linear.svg" },
  ],
};

const faqs = [
  {
    q: "How does Scantient scan without an SDK?",
    a: "Scantient performs external scans the same way an attacker would probe your applications. We analyze HTTP responses, JavaScript bundles, security headers, and public-facing configurations. No code changes or developer involvement required.",
  },
  {
    q: "What types of AI-generated apps does Scantient monitor?",
    a: "Any web application accessible via URL: built with Cursor, Lovable, Bolt, Replit, or any other AI coding tool. If the app has a URL, Scantient scans the app.",
  },
  {
    q: "How long does setup take?",
    a: "Under 2 minutes. Enter your app URLs, and Scantient starts scanning immediately. No SDK integration, no configuration files, no developer tickets.",
  },
  {
    q: "Is Scantient a replacement for penetration testing?",
    a: "No. Scantient provides continuous, automated external security monitoring: your always-on first line of defense. We recommend annual penetration testing alongside continuous monitoring.",
  },
  {
    q: "What compliance frameworks does Scantient support?",
    a: "Our reports map to SOC 2, ISO 27001, and NIST CSF controls. Enterprise plans include customizable compliance report templates for auditor-ready documentation.",
  },
  {
    q: "Does Scantient test for exposed admin and debug endpoints?",
    a: "Yes. Every scan probes 15 common dangerous paths: .env files, .git/HEAD, /api/admin, /api/debug, phpinfo.php, Spring Boot actuators, and more. These are the first paths attackers check. Scantient checks them first.",
  },
  {
    q: "Does Scantient monitor SSL certificate expiry?",
    a: "Yes. Scantient checks your SSL certificate on every scan and alerts you at 30, 14, and 7 days before expiry. A lapsed certificate takes your site offline for every user.",
  },
  {
    q: "How quickly can I get started?",
    a: "Under 2 minutes. Choose a plan, add your app URL, and Scantient starts scanning immediately. No SDK integration, no configuration files, no developer tickets.",
  },
];

const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Scantient",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "199",
    priceCurrency: "USD",
  },
  description: "Security monitoring for AI-generated applications",
  url: "https://scantient.com",
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    <div className="bg-alabaster-grey-50">
      {/* Nav - Frosted glass sticky header */}
      <nav className="sticky top-0 z-50 border-b border-alabaster-grey-200/60" style={{ background: "rgba(243,243,241,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-black-900">
              <span className="text-sm font-bold text-white">V</span>
            </div>
            <span className="font-bold tracking-tight text-ink-black-900">Scantient</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/security-checklist" className="hidden text-sm font-medium text-dusty-denim-700 transition-colors hover:text-ink-black-950 sm:block">Resources</Link>
            <Link href="/pricing" className="hidden text-sm font-medium text-dusty-denim-700 transition-colors hover:text-ink-black-950 sm:block">Pricing</Link>
            <Link href="/login" className="text-sm font-medium text-dusty-denim-700 transition-colors hover:text-ink-black-950">Sign in</Link>
            <Link
              href="/signup"
              className="rounded-full bg-prussian-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-prussian-blue-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-24 pt-24 sm:pb-32 sm:pt-32" style={{ background: "radial-gradient(ellipse at 50% 0%, #ebf2f9 0%, #f3f3f1 70%)" }}>
        <div className="mx-auto max-w-[1200px] text-center">
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-black-950 sm:text-6xl lg:text-[3.75rem]">
            Ship with confidence. <br />
            <span className="text-prussian-blue-600">Find security holes before your users do.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-[600px] text-lg leading-relaxed text-dusty-denim-700">
            One-click audit. 60 seconds. Zero doubt. $79 lifetime.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-lg bg-prussian-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-prussian-blue-600/25 transition-all hover:bg-prussian-blue-700 hover:shadow-xl hover:shadow-prussian-blue-700/25"
            >
              Start free scan
            </Link>
            <Link
              href="#pricing"
              className="rounded-lg border border-alabaster-grey-200 bg-white px-8 py-3.5 text-sm font-semibold text-dusty-denim-700 transition-colors hover:border-alabaster-grey-200 hover:bg-alabaster-grey-50"
            >
              See pricing plans
            </Link>
          </div>
          <p className="mt-5 text-xs text-dusty-denim-600">60-second security audit · No credit card · No setup required</p>
        </div>

        {/* Dashboard mockup frame */}
        <div className="max-w-5xl mx-auto mt-16">
          <div className="bg-white rounded-xl border border-alabaster-grey-200 shadow-2xl p-2">
            <div className="aspect-video bg-ink-black-50 rounded-lg overflow-hidden relative">
              {/* Top bar */}
              <div className="bg-white border-b border-alabaster-grey-200 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-ink-black-200" />
                  <div className="h-2 w-2 rounded-full bg-ink-black-200" />
                  <div className="h-2 w-2 rounded-full bg-ink-black-200" />
                </div>
                <span className="text-xs font-semibold text-ink-black-400">Scantient Dashboard</span>
                <div className="h-4 w-16 rounded bg-ink-black-100" />
              </div>
              {/* Stat cards row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
                {[
                  { label: "Apps Monitored", value: "12" },
                  { label: "Open Findings", value: "4" },
                  { label: "Last Scan", value: "2m ago" },
                ].map((card) => (
                  <div key={card.label} className="bg-white rounded-lg border border-alabaster-grey-200 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-ink-black-400">{card.label}</p>
                    <p className="mt-1 text-lg font-bold text-ink-black-800">{card.value}</p>
                    <div className="mt-2 h-1 w-8 rounded-full bg-prussian-blue-600 opacity-60" />
                  </div>
                ))}
              </div>
              {/* Table placeholder */}
              <div className="mx-4 bg-white rounded-lg border border-alabaster-grey-200 overflow-hidden">
                <div className="bg-ink-black-100 px-4 py-2 grid grid-cols-4 gap-4">
                  {["App", "Status", "Last Scan", "Findings"].map((h) => (
                    <div key={h} className="h-2 rounded bg-ink-black-200 w-3/4" />
                  ))}
                </div>
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className={`px-4 py-2.5 grid grid-cols-4 gap-4 ${row % 2 === 1 ? "bg-ink-black-50" : "bg-white"}`}>
                    <div className="h-2 rounded bg-ink-black-100 w-4/5" />
                    <div className="flex items-center gap-1">
                      <div className={`h-1.5 w-1.5 rounded-full ${row === 1 ? "bg-red-400" : "bg-emerald-400"}`} />
                      <div className="h-2 rounded bg-ink-black-100 w-3/4" />
                    </div>
                    <div className="h-2 rounded bg-ink-black-100 w-2/3" />
                    <div className="h-2 rounded bg-ink-black-100 w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats / Metrics bar */}
      <section className="border-b border-alabaster-grey-200 bg-white py-16">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-6 sm:gap-12 px-6 text-center">
          {[
            { value: "20", label: "essential security checks per scan" },
            { value: "<1 min", label: "from paste URL to first results" },
            { value: "$4.88M", label: "avg. cost of one data breach (IBM 2024)" },
            { value: "0", label: "developers or SDK required" },
          ].map((stat, i) => (
            <div key={stat.value} className="flex items-center gap-12">
              <div>
                <p className="text-5xl font-bold text-ink-black-600">{stat.value}</p>
                <p className="mt-1 text-sm uppercase tracking-wide text-dusty-denim-600">{stat.label}</p>
              </div>
              {i < 3 && <div className="hidden h-10 w-px bg-alabaster-grey-200 sm:block" />}
            </div>
          ))}
        </div>
      </section>

      {/* Feature cards - Bento Grid */}
      <section id="features" className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <h2 className="mb-3 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">20 Security Checks That Keep Your Users Safe</h2>
        <p className="mb-16 text-center text-dusty-denim-600">
          20 essential security checks. Every scan. Zero setup. No developer required.
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {checks.map((check) => (
            <div key={check.title} className="rounded-2xl border border-alabaster-grey-200 bg-white p-8 transition-all hover:shadow-lg" style={{ boxShadow: "0 1px 3px rgba(12,25,39,0.05)" }}>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-black-50">
                <span className="text-xl">{check.icon}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-ink-black-900">{check.icon} {check.title}</h3>
              {check.outcome && (
                <p className="mt-2 text-xs font-semibold text-prussian-blue-600">{check.outcome}</p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-dusty-denim-600">{check.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-alabaster-grey-200 bg-white px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-[1000px]">
          <h2 className="mb-16 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">How Scantient works</h2>

          {/* Zigzag timeline — desktop */}
          <div className="hidden md:block relative">
            {/* Center vertical line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-alabaster-grey-200" />

            <div className="space-y-16">
              {[
                { step: "1", title: "Register your apps", desc: "Paste your app URL. No code changes, no SDK, no developer involvement required. Setup takes 30 seconds." },
                { step: "2", title: "We scan continuously", desc: "Scantient runs 12 essential security checks every hour. API leaks, broken auth, missing headers, and more. Automatically." },
                { step: "3", title: "Get alerts when issues appear", desc: "When we find a problem, you get an instant alert via email or Slack. No noise, no false positives." },
                { step: "4", title: "Review and remediate in minutes", desc: "See your security score, open findings, and ready-to-use fix suggestions on your dashboard." },
              ].map((item, idx) => {
                const isOdd = idx % 2 === 0; // 0-indexed: step 1 (idx=0) → left, step 2 (idx=1) → right
                return (
                  <div key={item.step} className="relative flex items-center">
                    {/* Step number circle — centered on the line */}
                    <div className="absolute left-1/2 -translate-x-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-prussian-blue-600 text-sm font-bold text-white shadow-md">
                      {item.step}
                    </div>

                    {isOdd ? (
                      /* Odd steps: content on LEFT */
                      <>
                        <div className="w-5/12 pr-16 text-right">
                          <div className="rounded-xl border border-alabaster-grey-200 bg-white p-8 shadow-sm">
                            <h3 className="text-lg font-bold text-ink-black-950">{item.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-dusty-denim-600">{item.desc}</p>
                          </div>
                        </div>
                        <div className="w-7/12" />
                      </>
                    ) : (
                      /* Even steps: content on RIGHT */
                      <>
                        <div className="w-7/12" />
                        <div className="w-5/12 pl-16 text-left">
                          <div className="rounded-xl border border-alabaster-grey-200 bg-white p-8 shadow-sm">
                            <h3 className="text-lg font-bold text-ink-black-950">{item.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-dusty-denim-600">{item.desc}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile fallback — single column vertical stack */}
          <div className="md:hidden space-y-12">
            {[
              { step: "1", title: "Register your apps", desc: "Paste your app URL. No code changes, no SDK, no developer involvement required. Setup takes 30 seconds." },
              { step: "2", title: "We scan continuously", desc: "Scantient runs 12 essential security checks every hour. API leaks, broken auth, missing headers, and more. Automatically." },
              { step: "3", title: "Get alerts when issues appear", desc: "When we find a problem, you get an instant alert via email or Slack. No noise, no false positives." },
              { step: "4", title: "Review and remediate in minutes", desc: "See your security score, open findings, and ready-to-use fix suggestions on your dashboard." },
            ].map((item) => (
              <div key={item.step} className="flex gap-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-prussian-blue-600 text-sm font-bold text-white">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink-black-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-dusty-denim-600">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="mx-auto max-w-[1200px] px-6 py-24 text-center sm:py-32">
        <h2 className="mb-3 text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">Works with your stack</h2>
        <p className="mb-12 text-dusty-denim-600">Integrates with the tools your team already uses</p>

        {/* Live integrations */}
        <div className="mb-4 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>
        <div className="mb-14 flex flex-wrap items-center justify-center gap-6">
          {integrations.live.map((i) => (
            <div key={i.name} className="flex flex-col items-center gap-2.5">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-alabaster-grey-200 bg-white p-3 shadow-sm">
                <Image src={i.logo} alt={i.name} width={40} height={40} unoptimized className="h-full w-full object-contain" />
              </div>
              <span className="text-xs font-medium text-dusty-denim-600">{i.name}</span>
            </div>
          ))}
        </div>

        {/* Coming soon */}
        <div className="mb-4 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-alabaster-grey-100 px-3 py-1 text-xs font-semibold text-dusty-denim-500">
            Coming soon
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6">
          {integrations.soon.map((i) => (
            <div key={i.name} className="flex flex-col items-center gap-2.5 opacity-40">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-alabaster-grey-200 bg-white p-3 shadow-sm grayscale">
                <Image src={i.logo} alt={i.name} width={40} height={40} unoptimized className="h-full w-full object-contain" />
              </div>
              <span className="text-xs font-medium text-dusty-denim-400">{i.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof — radical transparency */}
      <section className="border-y border-alabaster-grey-200 bg-white px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="mb-4 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">Results that speak for themselves</h2>
          <p className="mb-16 text-center text-dusty-denim-600">We walk the walk. Scantient scans itself on every deploy. Here's what we actually find.</p>
          <div className="grid gap-8 md:grid-cols-3">
            {socialProof.map((item) => (
              <a
                key={item.stat}
                href={item.href}
                className="group relative rounded-2xl border border-alabaster-grey-200 bg-white p-8 transition-all hover:shadow-lg hover:-translate-y-0.5"
                style={{ boxShadow: "0 1px 3px rgba(12,25,39,0.05)" }}
              >
                <div className="mb-4 text-3xl">{item.icon}</div>
                <p className="text-4xl font-extrabold tracking-tight text-ink-black-950">{item.stat}</p>
                <p className="mt-1 text-sm font-semibold text-prussian-blue-600">{item.label}</p>
                <p className="mt-3 text-sm leading-relaxed text-dusty-denim-600">{item.detail}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Ready to get started CTA */}
      <section className="mx-auto max-w-[1200px] px-6 py-24 text-center sm:py-32">
        <h2 className="text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">Ready to get started?</h2>
        <p className="mx-auto mt-4 max-w-xl text-dusty-denim-600">
          See all three pricing tiers and find the right fit for your team.
        </p>
        <Link
          href="/pricing"
          className="mt-8 inline-block rounded-lg bg-prussian-blue-600 px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-prussian-blue-700"
        >
          View pricing
        </Link>
      </section>

      {/* FAQ */}
      <section className="border-t border-alabaster-grey-200 bg-white px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-[800px]">
          <h2 className="mb-16 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">Frequently asked questions</h2>
          <div className="space-y-10">
            {faqs.map((faq) => (
              <div key={faq.q}>
                <h3 className="font-bold text-ink-black-900">{faq.q}</h3>
                <p className="mt-3 text-sm leading-relaxed text-dusty-denim-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-ink-black-950 px-6 py-24 text-center sm:py-32">
        <h2 className="text-3xl font-extrabold tracking-[-0.02em] text-white sm:text-4xl">Stop finding out about breaches<br />from your CEO.</h2>
        <p className="mx-auto mt-6 max-w-xl text-alabaster-grey-200">
          Add your first app URL. We start scanning in 60 seconds.
        </p>
        <Link
          href="/signup"
          className="mt-10 inline-block rounded-lg bg-white px-8 py-3.5 text-sm font-semibold text-ink-black-950 transition-colors hover:bg-alabaster-grey-100"
        >
          Get started
        </Link>
      </section>

      <Footer />
    </div>
    </>
  );
}
