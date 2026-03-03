import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "AI Policy Compliance Scanner — Detect Shadow AI & Enforce Usage Policies | Scantient",
  description:
    "Scan your organization for shadow AI tools, policy gaps, and compliance risks. Scantient detects every AI tool in use, maps it to your policy, and generates audit-ready reports. Free scan.",
  keywords:
    "AI tool compliance scanner, shadow AI detection, AI usage policy enforcement, AI compliance audit",
  openGraph: {
    title: "AI Policy Compliance Scanner — Detect Shadow AI & Enforce Usage Policies | Scantient",
    description:
      "Scan your organization for shadow AI tools, policy gaps, and compliance risks. Free scan — results in minutes.",
    url: "https://scantient.com/ai-policy-compliance",
    siteName: "Scantient",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Policy Compliance Scanner — Detect Shadow AI & Enforce Usage Policies",
    description:
      "Scan your organization for shadow AI tools, policy gaps, and compliance risks. Free scan.",
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://scantient.com",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "AI Policy Compliance Scanner",
      item: "https://scantient.com/ai-policy-compliance",
    },
  ],
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "AI Policy Compliance Scanner",
  description:
    "Scan your organization for shadow AI tools, policy gaps, and compliance risks.",
  url: "https://scantient.com/ai-policy-compliance",
  publisher: {
    "@type": "Organization",
    name: "Scantient",
    url: "https://scantient.com",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is a shadow AI detection scan?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A shadow AI detection scan examines your organization's network traffic, endpoint activity, and application usage logs to identify AI tools being used without official IT approval. Scantient's scanner provides a complete inventory of every AI tool in use — approved or not — so you know exactly where your policy gaps are.",
      },
    },
    {
      "@type": "Question",
      name: "How does AI policy compliance scanning work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Scantient connects to your organization's identity provider, DNS logs, and endpoint data. It maps every detected AI tool against your defined policy, flags unapproved usage, identifies data types that may have been shared, and generates a compliance report with evidence for your auditors.",
      },
    },
    {
      "@type": "Question",
      name: "What compliance frameworks does AI policy enforcement support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Scantient's AI compliance scanning helps you meet requirements under SOC 2 (CC6.1, CC7.2), ISO 27001 (A.8.9, A.5.23), NIST CSF (ID.AM, PR.AC), GDPR Article 28 (data processors), and HIPAA (Business Associate requirements). Reports are formatted for direct submission to auditors.",
      },
    },
    {
      "@type": "Question",
      name: "Can Scantient help create an AI usage policy from scratch?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Scantient includes a library of AI usage policy templates pre-configured for common compliance frameworks. You can customize the allowlist, data handling rules, and enforcement actions for your organization. The scanner then automatically monitors against your defined policy.",
      },
    },
    {
      "@type": "Question",
      name: "How quickly can I get results from a free scan?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most organizations see their first AI tool inventory report within 15 minutes of connecting their first data source. A full compliance gap report, including framework mapping and prioritized findings, is typically available within 24 hours of completing the initial setup.",
      },
    },
  ],
};

const steps = [
  {
    step: "01",
    title: "Scan",
    desc: "Connect your identity provider, DNS resolver, or endpoint agent. Scantient immediately begins cataloging every AI tool accessed by your team.",
  },
  {
    step: "02",
    title: "Detect",
    desc: "Get a complete inventory of AI tools in use — approved and unapproved. See which tools handle sensitive data, which users are using them, and what data types are involved.",
  },
  {
    step: "03",
    title: "Gap Analysis",
    desc: "Scantient maps your actual AI tool usage against your defined policy (or a recommended baseline). Every gap is prioritized by risk and compliance impact.",
  },
  {
    step: "04",
    title: "Enforce",
    desc: "Generate policy templates, send automated alerts for policy violations, and produce audit-ready reports. Close the gap between what your policy says and what's actually happening.",
  },
];

const features = [
  {
    icon: "🔍",
    title: "Continuous Monitoring",
    desc: "24/7 scanning across endpoints, DNS, and identity providers. Know the moment a new AI tool enters your environment.",
  },
  {
    icon: "📋",
    title: "Policy Templates",
    desc: "Pre-built AI usage policy templates for SOC 2, ISO 27001, and HIPAA. Customize and deploy in minutes.",
  },
  {
    icon: "🗂️",
    title: "Audit Trail",
    desc: "Immutable, timestamped logs of every AI tool usage event. Ready for auditor review with zero manual data collection.",
  },
  {
    icon: "⚡",
    title: "Real-Time Alerts",
    desc: "Instant notifications when unapproved AI tools are detected, sensitive data types are involved, or policy thresholds are crossed.",
  },
  {
    icon: "🗺️",
    title: "Framework Mapping",
    desc: "Every finding maps to SOC 2, ISO 27001, NIST CSF, or GDPR controls. Walk into any audit with evidence pre-organized.",
  },
  {
    icon: "🤝",
    title: "Risk-Based Prioritization",
    desc: "Not all shadow AI is equal. Scantient ranks findings by data sensitivity, tool risk profile, and compliance exposure so your team focuses on what matters.",
  },
];

const stats = [
  { value: "73%", label: "of engineering teams use at least 8 AI tools" },
  { value: "91%", label: "of those tools are not covered by a formal AI policy" },
  { value: "3 in 5", label: "compliance leaders say AI tool governance is their fastest-growing risk" },
  { value: "48h", label: "average time to first actionable compliance report with Scantient" },
];

export default function AIPolicyCompliancePage() {
  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <MarketingNav />

      {/* Breadcrumb */}
      <div className="mx-auto max-w-6xl px-4 pt-8">
        <nav className="flex items-center gap-2 text-sm text-gray-400">
          <Link href="/" className="hover:text-gray-700 transition-colors">Home</Link>
          <span>/</span>
          <span className="text-gray-700">AI Policy Compliance Scanner</span>
        </nav>
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">
          AI Compliance Scanner
        </p>
        <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          Your team is using AI tools you don&apos;t know about. That&apos;s a compliance problem.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-500">
          Scantient scans your organization for shadow AI tools, maps usage against your policy, and
          generates audit-ready compliance reports. Know exactly where your AI policy gaps are — before
          your auditors do.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="rounded-lg bg-black px-8 py-3.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Start Free Scan
          </Link>
          <Link
            href="/blog/ai-policy-compliance-engineering"
            className="rounded-lg border border-gray-200 px-8 py-3.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Why this matters →
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                <p className="mt-2 text-sm leading-snug text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">The Problem</p>
            <h2 className="text-3xl font-bold leading-tight tracking-tight">
              AI tool governance is the fastest-growing compliance gap in engineering organizations
            </h2>
            <div className="mt-6 space-y-4 leading-relaxed text-gray-600">
              <p>
                Engineers use Copilot, ChatGPT, Claude, Cursor, Codeium, and a dozen other AI tools every day.
                Most of those tools aren&apos;t in your acceptable-use policy. Many of them process customer
                data, proprietary code, and credentials — without your knowledge, without data processing
                agreements, and without audit logs.
              </p>
              <p>
                When your SOC 2 auditor asks how you govern AI tool usage, &ldquo;we have a policy&rdquo; isn&apos;t
                enough. They want monitoring evidence, incident logs, and demonstrated controls. The organizations
                that pass audits are the ones with continuous detection — not point-in-time surveys.
              </p>
              <p>
                Shadow AI isn&apos;t a future risk. It&apos;s happening in your organization right now.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            {[
              { risk: "Data exposure via unapproved LLMs", severity: "Critical" },
              { risk: "No DPA coverage for AI tool vendors", severity: "High" },
              { risk: "Credentials pasted into public AI tools", severity: "Critical" },
              { risk: "No audit trail for AI-generated code", severity: "High" },
              { risk: "AI tool sprawl — no approved allowlist", severity: "Medium" },
              { risk: "IP ownership gaps in AI-assisted work", severity: "Medium" },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-5 py-3">
                <span className="text-sm text-gray-700">{item.risk}</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.severity === "Critical"
                      ? "bg-red-50 text-red-600"
                      : item.severity === "High"
                      ? "bg-orange-50 text-orange-600"
                      : "bg-yellow-50 text-yellow-700"
                  }`}
                >
                  {item.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">How It Works</p>
            <h2 className="text-3xl font-bold leading-tight tracking-tight">
              From scan to compliant in four steps
            </h2>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.step} className="relative">
                <span className="text-5xl font-bold text-gray-100">{step.step}</span>
                <h3 className="mt-2 text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">Features</p>
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Everything you need to govern AI tool usage
          </h2>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 p-6">
              <span className="text-2xl">{feature.icon}</span>
              <h3 className="mt-3 text-base font-semibold text-gray-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-2xl font-bold">Frequently Asked Questions</h2>
          <div className="mt-10 space-y-10">
            {faqSchema.mainEntity.map((faq, i) => (
              <div key={i}>
                <h3 className="text-lg font-semibold text-gray-900">{faq.name}</h3>
                <p className="mt-3 leading-relaxed text-gray-600">{faq.acceptedAnswer.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="rounded-2xl bg-gray-50 p-12 text-center">
          <h2 className="text-3xl font-bold">Stop guessing. Start scanning.</h2>
          <p className="mx-auto mt-4 max-w-xl text-gray-500">
            Get a complete picture of AI tool usage across your organization in minutes. Free scan — no
            credit card required. Audit-ready reports from day one.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-lg bg-black px-8 py-3.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              Start Free Scan
            </Link>
            <Link
              href="/contact"
              className="rounded-lg border border-gray-200 px-8 py-3.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Talk to Sales
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-400">Setup in 2 minutes · SOC 2 compliant</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
