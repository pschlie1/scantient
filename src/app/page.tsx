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
    <div className="bg-white">
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
            <span className="text-sm font-bold text-white">V</span>
          </div>
          <span className="font-bold">VibeSafe</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/security-checklist" className="hidden text-sm text-gray-500 hover:text-black sm:block">Resources</Link>
          <Link href="/#pricing" className="hidden text-sm text-gray-500 hover:text-black sm:block">Pricing</Link>
          <Link href="/login" className="text-sm text-gray-600 hover:text-black">Sign in</Link>
          <Link
            href="/signup"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Start free trial
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 pb-20 pt-20 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Trusted by 50+ engineering teams
        </div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
          Your teams ship AI-built apps.
          <br />
          <span className="text-gray-400">You see nothing.</span>
        </h1>
        <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-gray-500">
          Every department is building with AI. Legal, sales, ops — they&apos;re all shipping apps with Cursor, Lovable, and Bolt. VibeSafe gives IT leaders continuous visibility into the security posture of every AI-generated application. No SDK. No developer involvement.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-black px-8 py-3.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Start 14-day free trial
          </Link>
          <Link
            href="#pricing"
            className="rounded-lg border px-8 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            View pricing
          </Link>
        </div>
        <p className="mt-4 text-xs text-gray-400">No credit card required · Setup in 2 minutes · SOC 2 aligned</p>
      </section>

      {/* Trust logos */}
      <section className="border-y bg-gray-50/50 py-10">
        <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-gray-400">
          Trusted by security-conscious teams at
        </p>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-4">
          {["Meridian", "Caliber", "Apex", "NovaTech", "Stackline"].map((name) => (
            <span key={name} className="text-lg font-semibold text-gray-300">{name}</span>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="py-12">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 px-4 text-center text-sm text-gray-500">
          <div>
            <p className="text-3xl font-bold text-gray-900">73%</p>
            <p className="mt-1">of vibe-coded apps have vulnerabilities</p>
          </div>
          <div className="hidden h-8 w-px bg-gray-200 sm:block" />
          <div>
            <p className="text-3xl font-bold text-gray-900">170+</p>
            <p className="mt-1">Loveable apps breached in one CVE</p>
          </div>
          <div className="hidden h-8 w-px bg-gray-200 sm:block" />
          <div>
            <p className="text-3xl font-bold text-gray-900">$50K–$500K</p>
            <p className="mt-1">cost per undetected breach</p>
          </div>
          <div className="hidden h-8 w-px bg-gray-200 sm:block" />
          <div>
            <p className="text-3xl font-bold text-gray-900">0 SDK</p>
            <p className="mt-1">instrumentation required</p>
          </div>
        </div>
      </section>

      {/* What we check */}
      <section id="features" className="mx-auto max-w-5xl px-4 py-20">
        <h2 className="mb-2 text-center text-3xl font-bold">What we monitor</h2>
        <p className="mb-12 text-center text-gray-500">
          Continuous external checks that catch what manual reviews miss
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {checks.map((check) => (
            <div key={check.title} className="rounded-2xl border p-6 transition-colors hover:border-gray-300">
              <span className="text-2xl">{check.icon}</span>
              <h3 className="mt-4 font-semibold">{check.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{check.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-gray-50/50 px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold">How it works</h2>
          <div className="space-y-10">
            {[
              { step: "1", title: "Register your apps", desc: "Enter the URL of any AI-built app. No code changes, no SDK, no developer involvement required." },
              { step: "2", title: "We scan continuously", desc: "Every 4 hours, VibeSafe runs security and health checks from the outside — exactly like an attacker would." },
              { step: "3", title: "Get plain-language alerts", desc: "When something breaks or a vulnerability appears, you get an alert with a ready-to-paste AI fix prompt." },
              { step: "4", title: "Review your governance dashboard", desc: "Weekly compliance reports show every app's status, open findings, and remediation progress." },
            ].map((item) => (
              <div key={item.step} className="flex gap-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h2 className="mb-2 text-3xl font-bold">Works with your stack</h2>
        <p className="mb-12 text-gray-500">Integrates with the tools your team already uses</p>
        <div className="flex flex-wrap items-center justify-center gap-8">
          {integrations.map((i) => (
            <div key={i.name} className="flex flex-col items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border bg-white text-2xl">
                {i.icon}
              </div>
              <span className="text-xs text-gray-500">{i.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-y bg-gray-50/50 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-3xl font-bold">What security leaders say</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-2xl border bg-white p-6">
                <p className="text-sm leading-relaxed text-gray-600">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-6">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.title}, {t.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-4 py-20">
        <h2 className="mb-2 text-center text-3xl font-bold">Simple, transparent pricing</h2>
        <p className="mb-12 text-center text-gray-500">
          One undetected breach costs $50K–$500K. VibeSafe pays for itself on day one.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-2xl border p-6 ${tier.highlighted ? "border-black ring-1 ring-black" : ""}`}
            >
              {tier.highlighted && (
                <span className="mb-3 inline-block rounded-full bg-black px-2.5 py-0.5 text-xs font-medium text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-bold">{tier.name}</h3>
              <div className="mt-2">
                <span className="text-3xl font-bold">{tier.price}</span>
                <span className="text-gray-500">{tier.period}</span>
              </div>
              <p className="mt-2 text-sm text-gray-500">{tier.desc}</p>
              <Link
                href="/signup"
                className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-medium transition ${
                  tier.highlighted
                    ? "bg-black text-white hover:bg-gray-800"
                    : "border text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tier.cta}
              </Link>
              <ul className="mt-6 space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="mt-0.5 text-green-600">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-gray-50/50 px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold">Frequently asked questions</h2>
          <div className="space-y-8">
            {faqs.map((faq) => (
              <div key={faq.q}>
                <h3 className="font-semibold">{faq.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-black px-4 py-20 text-center text-white">
        <h2 className="text-3xl font-bold sm:text-4xl">Stop finding out about breaches<br />from your CEO.</h2>
        <p className="mx-auto mt-6 max-w-xl text-gray-400">
          Start monitoring your AI-built app portfolio in 2 minutes. No credit card required.
        </p>
        <Link
          href="/signup"
          className="mt-10 inline-block rounded-lg bg-white px-8 py-3.5 text-sm font-medium text-black hover:bg-gray-100 transition-colors"
        >
          Start your free trial
        </Link>
      </section>

      <Footer />
    </div>
  );
}
