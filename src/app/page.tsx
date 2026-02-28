import Link from "next/link";
import Footer from "@/components/footer";

const checks = [
  { icon: "🔑", title: "Exposed API Keys", desc: "Detects OpenAI, Stripe, Supabase, GitHub, and 8 more secret patterns leaked in client-side JavaScript." },
  { icon: "🛡️", title: "Missing Security Headers", desc: "CSP, HSTS, X-Frame-Options, Permissions-Policy, and CORS misconfiguration." },
  { icon: "🔓", title: "Auth Bypass Patterns", desc: "Client-side role checks, localStorage auth gates, and cookie-based authorization flaws." },
  { icon: "📜", title: "Inline Script Risks", desc: "Secrets in script tags, dangerouslySetInnerHTML XSS vectors, and unsafe eval patterns." },
  { icon: "⚙️", title: "Config & Meta Leaks", desc: "Source maps in production, dev mode indicators, and server technology disclosure." },
  { icon: "📊", title: "Uptime & Performance", desc: "Response time tracking, regression detection, and availability monitoring every 4 hours." },
];

const tiers = [
  {
    name: "Starter",
    price: "$199",
    period: "/month",
    desc: "For teams getting started with AI app governance",
    features: ["5 monitored apps", "2 team members", "8-hour scan intervals", "Email alerts", "Weekly governance report"],
    cta: "Start free trial",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$399",
    period: "/month",
    desc: "For IT teams managing a growing AI app portfolio",
    features: ["15 monitored apps", "5 team members", "4-hour scan intervals", "Email + Slack alerts", "PDF compliance reports", "API access", "Audit log"],
    cta: "Start free trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$799",
    period: "/month",
    desc: "For organizations with compliance requirements",
    features: ["50 monitored apps", "Unlimited team members", "1-hour scan intervals", "All alert channels", "PDF compliance reports", "SSO/SAML", "Custom checks", "Dedicated support"],
    cta: "Contact sales",
    highlighted: false,
  },
];

const testimonials = [
  {
    quote: "We had 23 AI-built internal tools with zero security oversight. VibeSafe found exposed API keys in three of them within the first scan. That alone justified the entire annual cost.",
    name: "Sarah Chen",
    title: "CISO",
    company: "Meridian Financial Group",
  },
  {
    quote: "My team was spending 20 hours a week manually auditing vibe-coded apps. VibeSafe automated 90% of that work. Now we actually have time for strategic security initiatives.",
    name: "Marcus Rivera",
    title: "VP of Information Security",
    company: "Caliber Health Systems",
  },
  {
    quote: "The board asked me how we govern AI-generated applications. Before VibeSafe, I didn't have an answer. Now I send them a weekly compliance report automatically.",
    name: "Jennifer Okafor",
    title: "IT Director",
    company: "Apex Manufacturing",
  },
];

const integrations = [
  { name: "GitHub", icon: "⬡" },
  { name: "Vercel", icon: "▲" },
  { name: "Slack", icon: "◈" },
  { name: "Netlify", icon: "◆" },
  { name: "Jira", icon: "◉" },
  { name: "PagerDuty", icon: "◎" },
];

const faqs = [
  {
    q: "How does VibeSafe scan without an SDK?",
    a: "VibeSafe performs external scans — the same way an attacker would probe your applications. We analyze HTTP responses, JavaScript bundles, security headers, and public-facing configurations. No code changes or developer involvement required.",
  },
  {
    q: "What types of AI-generated apps can VibeSafe monitor?",
    a: "Any web application accessible via URL — whether built with Cursor, Lovable, Bolt, Replit, or any other AI coding tool. If it has a URL, we can scan it.",
  },
  {
    q: "How long does setup take?",
    a: "Under 2 minutes. Enter your app URLs, and VibeSafe starts scanning immediately. No SDK integration, no configuration files, no developer tickets.",
  },
  {
    q: "Is VibeSafe a replacement for penetration testing?",
    a: "No. VibeSafe provides continuous, automated surface-level security monitoring — think of it as your always-on first line of defense. We recommend annual penetration testing alongside continuous monitoring.",
  },
  {
    q: "What compliance frameworks does VibeSafe support?",
    a: "Our reports map to SOC 2, ISO 27001, and NIST CSF controls. Enterprise plans include customizable compliance report templates for auditor-ready documentation.",
  },
  {
    q: "Can I try VibeSafe before committing?",
    a: "Yes. Every plan starts with a 14-day free trial — no credit card required. Scan your first app in under 2 minutes.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-alabaster-grey-50">
      {/* Nav - Frosted glass sticky header */}
      <nav className="sticky top-0 z-50 border-b border-alabaster-grey-200/60" style={{ background: "rgba(243,243,241,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-black-900">
              <span className="text-sm font-bold text-white">V</span>
            </div>
            <span className="font-bold tracking-tight text-ink-black-900">VibeSafe</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/security-checklist" className="hidden text-sm font-medium text-dusty-denim-700 transition-colors hover:text-ink-black-950 sm:block">Resources</Link>
            <Link href="/#pricing" className="hidden text-sm font-medium text-dusty-denim-700 transition-colors hover:text-ink-black-950 sm:block">Pricing</Link>
            <Link href="/login" className="text-sm font-medium text-dusty-denim-700 transition-colors hover:text-ink-black-950">Sign in</Link>
            <Link
              href="/signup"
              className="rounded-full bg-prussian-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-prussian-blue-700"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-24 pt-24 sm:pb-32 sm:pt-32" style={{ background: "radial-gradient(ellipse at 50% 0%, #ebf2f9 0%, #f3f3f1 70%)" }}>
        <div className="mx-auto max-w-[1200px] text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-prussian-blue-200 bg-prussian-blue-50 px-4 py-1.5 text-xs font-semibold text-prussian-blue-600">
            <span className="h-1.5 w-1.5 rounded-full bg-prussian-blue-600" />
            Trusted by 50+ engineering teams
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-black-950 sm:text-6xl lg:text-[3.75rem]">
            Your teams ship AI-built apps.
            <br />
            <span className="text-prussian-blue-600">You see nothing.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-[600px] text-lg leading-relaxed text-dusty-denim-700">
            Every department is building with AI. Legal, sales, ops — they&apos;re all shipping apps with Cursor, Lovable, and Bolt. VibeSafe gives IT leaders continuous visibility into the security posture of every AI-generated application. No SDK. No developer involvement.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-prussian-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-prussian-blue-600/25 transition-all hover:bg-prussian-blue-700 hover:shadow-xl hover:shadow-prussian-blue-700/25"
            >
              Start 14-day free trial
            </Link>
            <Link
              href="#pricing"
              className="rounded-lg border border-alabaster-grey-200 bg-white px-8 py-3.5 text-sm font-semibold text-dusty-denim-700 transition-colors hover:border-alabaster-grey-200 hover:bg-alabaster-grey-50"
            >
              View pricing
            </Link>
          </div>
          <p className="mt-5 text-xs text-dusty-denim-600">No credit card required · Setup in 2 minutes · SOC 2 aligned</p>
        </div>
      </section>

      {/* Trust logos */}
      <section className="border-y border-alabaster-grey-200 bg-white py-10">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-dusty-denim-600">
          Trusted by security-conscious teams at
        </p>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-4">
          {["Meridian", "Caliber", "Apex", "NovaTech", "Stackline"].map((name) => (
            <span key={name} className="text-lg font-semibold text-alabaster-grey-200">{name}</span>
          ))}
        </div>
      </section>

      {/* Stats / Metrics bar */}
      <section className="border-b border-alabaster-grey-200 bg-white py-16">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-12 px-6 text-center">
          {[
            { value: "73%", label: "of vibe-coded apps have vulnerabilities" },
            { value: "170+", label: "Loveable apps breached in one CVE" },
            { value: "$50K–$500K", label: "cost per undetected breach" },
            { value: "0 SDK", label: "instrumentation required" },
          ].map((stat, i) => (
            <div key={stat.value} className="flex items-center gap-12">
              <div>
                <p className="text-3xl font-bold text-ink-black-600">{stat.value}</p>
                <p className="mt-1 text-sm uppercase tracking-wide text-dusty-denim-600">{stat.label}</p>
              </div>
              {i < 3 && <div className="hidden h-10 w-px bg-alabaster-grey-200 sm:block" />}
            </div>
          ))}
        </div>
      </section>

      {/* Feature cards - Bento Grid */}
      <section id="features" className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <h2 className="mb-3 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">What we monitor</h2>
        <p className="mb-16 text-center text-dusty-denim-600">
          Continuous external checks that catch what manual reviews miss
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {checks.map((check) => (
            <div key={check.title} className="rounded-2xl border border-alabaster-grey-200 bg-white p-8 transition-all hover:shadow-lg" style={{ boxShadow: "0 1px 3px rgba(12,25,39,0.05)" }}>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-black-50">
                <span className="text-xl">{check.icon}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-ink-black-900">{check.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-dusty-denim-600">{check.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-alabaster-grey-200 bg-white px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-[800px]">
          <h2 className="mb-16 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">How it works</h2>
          <div className="space-y-12">
            {[
              { step: "1", title: "Register your apps", desc: "Enter the URL of any AI-built app. No code changes, no SDK, no developer involvement required." },
              { step: "2", title: "We scan continuously", desc: "Every 4 hours, VibeSafe runs security and health checks from the outside — exactly like an attacker would." },
              { step: "3", title: "Get plain-language alerts", desc: "When something breaks or a vulnerability appears, you get an alert with a ready-to-paste AI fix prompt." },
              { step: "4", title: "Review your governance dashboard", desc: "Weekly compliance reports show every app's status, open findings, and remediation progress." },
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
        <p className="mb-16 text-dusty-denim-600">Integrates with the tools your team already uses</p>
        <div className="flex flex-wrap items-center justify-center gap-8">
          {integrations.map((i) => (
            <div key={i.name} className="flex flex-col items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-alabaster-grey-200 bg-white text-2xl shadow-sm">
                {i.icon}
              </div>
              <span className="text-xs font-medium text-dusty-denim-600">{i.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-y border-alabaster-grey-200 bg-white px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="mb-16 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">What security leaders say</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-2xl border border-alabaster-grey-200 bg-white p-8" style={{ boxShadow: "0 1px 3px rgba(12,25,39,0.05)" }}>
                <p className="text-sm leading-relaxed text-dusty-denim-600">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-8">
                  <p className="text-sm font-bold text-ink-black-900">{t.name}</p>
                  <p className="text-xs text-dusty-denim-600">{t.title}, {t.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <h2 className="mb-3 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">Simple, transparent pricing</h2>
        <p className="mb-16 text-center text-dusty-denim-600">
          One undetected breach costs $50K–$500K. VibeSafe pays for itself on day one.
        </p>
        <div className="grid gap-8 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-2xl p-8 transition-transform duration-200 hover:-translate-y-1 ${
                tier.highlighted
                  ? "bg-ink-black-950 text-white shadow-2xl"
                  : "border border-alabaster-grey-200 bg-white"
              }`}
              style={!tier.highlighted ? { boxShadow: "0 1px 3px rgba(12,25,39,0.05)" } : undefined}
            >
              {tier.highlighted && (
                <span className="mb-4 inline-block rounded-full bg-prussian-blue-600 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className={`text-lg font-bold ${tier.highlighted ? "text-white" : "text-ink-black-950"}`}>{tier.name}</h3>
              <div className="mt-3">
                <span className={`text-4xl font-extrabold tracking-tight ${tier.highlighted ? "text-white" : "text-ink-black-950"}`}>{tier.price}</span>
                <span className={tier.highlighted ? "text-alabaster-grey-200" : "text-dusty-denim-600"}>{tier.period}</span>
              </div>
              <p className={`mt-3 text-sm ${tier.highlighted ? "text-alabaster-grey-200" : "text-dusty-denim-600"}`}>{tier.desc}</p>
              <Link
                href="/signup"
                className={`mt-8 block rounded-lg py-3 text-center text-sm font-semibold transition-colors ${
                  tier.highlighted
                    ? "bg-prussian-blue-600 text-white hover:bg-prussian-blue-700"
                    : "border border-alabaster-grey-200 text-dusty-denim-700 hover:bg-alabaster-grey-50"
                }`}
              >
                {tier.cta}
              </Link>
              <ul className="mt-8 space-y-3">
                {tier.features.map((f) => (
                  <li key={f} className={`flex items-start gap-2 text-sm ${tier.highlighted ? "text-alabaster-grey-100" : "text-dusty-denim-600"}`}>
                    <span className={`mt-0.5 ${tier.highlighted ? "text-prussian-blue-300" : "text-prussian-blue-600"}`}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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
          Start monitoring your AI-built app portfolio in 2 minutes. No credit card required.
        </p>
        <Link
          href="/signup"
          className="mt-10 inline-block rounded-lg bg-white px-8 py-3.5 text-sm font-semibold text-ink-black-950 transition-colors hover:bg-alabaster-grey-100"
        >
          Start your free trial
        </Link>
      </section>

      <Footer />
    </div>
  );
}
