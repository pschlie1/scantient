import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "Scantient for MSPs — Compliance Confidence Across Every Client | Scantient",
  description:
    "MSPs use Scantient to deliver security compliance monitoring across every client organization. Add clients, set policies, monitor centrally. Built for post-acquisition cleanups, compliance audits, and ongoing client security.",
  keywords:
    "MSP compliance monitoring, managed service provider security audit, AI compliance for MSPs, client compliance management",
  openGraph: {
    title: "Scantient for MSPs — Compliance Confidence Across Every Client",
    description:
      "MSPs use Scantient to deliver security compliance monitoring across every client organization. Add clients, set policies, monitor centrally.",
    url: "https://scantient.com/for-msps",
    siteName: "Scantient",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scantient for MSPs — Compliance Confidence Across Every Client",
    description:
      "MSPs use Scantient to deliver security compliance monitoring across every client organization.",
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
      name: "For MSPs",
      item: "https://scantient.com/for-msps",
    },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How does Scantient work for managed service providers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MSPs get a multi-tenant Scantient account where each client is a separate, isolated organization. You add a client, connect their data sources (identity provider, DNS, endpoints), and Scantient begins monitoring immediately. All clients are visible from your central MSP dashboard — you can manage policies, review findings, and generate reports across all client orgs without switching accounts.",
      },
    },
    {
      "@type": "Question",
      name: "What does the MSP pricing model look like?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Scantient offers MSP-specific pricing with per-client-org billing. Volume discounts apply at 5, 10, and 25+ client organizations. Contact our MSP partnerships team for custom pricing that fits your margins and client billing model.",
      },
    },
    {
      "@type": "Question",
      name: "How does Scantient help with post-acquisition compliance cleanup?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Post-acquisition is one of the highest-risk windows for any organization — you're inheriting an unknown security posture. Scantient can onboard a new client organization and generate a full compliance baseline report within 24 hours: shadow AI tools, IAM gaps, misconfigurations, and compliance framework mapping. This gives your team a prioritized remediation roadmap from day one.",
      },
    },
    {
      "@type": "Question",
      name: "Can MSPs white-label Scantient for their clients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Scantient's MSP tier includes white-label reporting — compliance reports, executive summaries, and audit documents can be exported with your MSP's branding. This lets you package Scantient's findings as part of your service offering.",
      },
    },
    {
      "@type": "Question",
      name: "What compliance frameworks does Scantient cover for MSP clients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Scantient supports SOC 2, ISO 27001, NIST CSF, HIPAA, GDPR, and AI-specific governance frameworks. Each client organization can have its own framework configuration based on their regulatory obligations. MSPs can set default frameworks that apply to all new clients, then customize per-client as needed.",
      },
    },
  ],
};

const painPoints = [
  {
    title: "Every client has a different security posture",
    desc: "One client is SOC 2 certified. Another just got acquired and is a mess. A third is a startup with zero compliance history. You need a single tool that handles all three without custom workflows for each.",
  },
  {
    title: "Audit requests come at the worst times",
    desc: "A client gets acquired and due diligence starts Monday. A prospective enterprise customer wants a security review by Friday. Without continuous monitoring, every audit is a fire drill.",
  },
  {
    title: "AI tool sprawl is exploding in every client org",
    desc: "Your clients' employees are using ChatGPT, Copilot, Claude, and a dozen other AI tools. None of them are in the acceptable-use policy. All of them create compliance exposure. And none of your current tools detect them.",
  },
  {
    title: "You can't scale manual compliance reviews",
    desc: "Quarterly manual audits made sense when clients had 10 apps. In 2026, a 50-person startup runs 200+ SaaS tools and a dozen AI assistants. You need automation, not spreadsheets.",
  },
];

const useCases = [
  {
    title: "Post-Acquisition Cleanup",
    badge: "🔥 Hot Use Case",
    desc: "When a client acquires a company or gets acquired, Scantient generates a full compliance baseline in 24 hours. Unknown apps, shadow AI tools, IAM misconfigurations, policy gaps — everything surfaces immediately so you can remediate before the auditors arrive.",
    cta: "Learn more about acquisition due diligence →",
  },
  {
    title: "Compliance Audits",
    badge: "📋 Core Service",
    desc: "Turn compliance audits from fire drills into a billable service. Scantient's continuous monitoring means audit evidence is always ready. Generate SOC 2, ISO 27001, or NIST CSF reports on demand — with control mapping already done.",
    cta: "See compliance framework coverage →",
  },
  {
    title: "Ongoing AI Governance",
    badge: "🤖 New Revenue",
    desc: "Sell AI tool governance as a managed service. Continuously monitor every client's AI tool usage, enforce their acceptable-use policies, and deliver monthly reports showing what AI tools are in use, which are approved, and what the risk exposure is.",
    cta: "See AI policy compliance scanner →",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Add a client organization",
    desc: "Create a new client org in your MSP dashboard. Each client is fully isolated — their data never mixes with other clients.",
  },
  {
    step: "02",
    title: "Connect their data sources",
    desc: "Scantient connects to the client's identity provider (Okta, Azure AD, Google Workspace), DNS resolver, and endpoint agents. Setup typically takes under 30 minutes.",
  },
  {
    step: "03",
    title: "Set compliance policies",
    desc: "Apply a framework template (SOC 2, ISO 27001, HIPAA) or customize policies for that client's specific obligations. Policies propagate automatically.",
  },
  {
    step: "04",
    title: "Monitor centrally",
    desc: "All client findings surface in your MSP dashboard. Set alert thresholds, assign findings to client contacts, and generate white-labeled reports on demand.",
  },
];

const testimonials = [
  {
    quote: "We onboarded a client post-acquisition and had a full compliance gap report within 18 hours. That would have taken us two weeks manually.",
    author: "Director of Security Services",
    company: "Regional MSP, 45 clients",
  },
  {
    quote: "Scantient's multi-client dashboard is the first tool that actually works for how MSPs operate. Everything else was built for single organizations.",
    author: "VP of Technical Operations",
    company: "Managed IT Provider",
  },
  {
    quote: "We launched an AI compliance package for our clients using Scantient as the backbone. It's now one of our fastest-growing service lines.",
    author: "CTO",
    company: "Security-focused MSP",
  },
];

export default function ForMSPsPage() {
  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
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
          <span className="text-gray-700">For MSPs</span>
        </nav>
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">
              For Managed Service Providers
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Compliance Confidence Across Every Client
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-gray-500">
              Scantient is the compliance layer MSPs deploy across their entire client portfolio. One platform,
              every client, continuous monitoring — from shadow AI detection to full SOC 2 audit trail.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="rounded-lg bg-black px-8 py-3.5 text-center text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                Get started
              </Link>
              <Link
                href="/contact"
                className="rounded-lg border border-gray-200 px-8 py-3.5 text-center text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                MSP Partnership Inquiry
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-gray-400">MSP Dashboard</p>
            <div className="mt-6 space-y-3">
              {[
                { client: "Acme Corp", status: "Compliant", score: "94", badge: "bg-green-50 text-green-700" },
                { client: "TechStart Inc", status: "2 Critical Findings", score: "71", badge: "bg-red-50 text-red-700" },
                { client: "Riverside Health", status: "Audit Ready", score: "88", badge: "bg-green-50 text-green-700" },
                { client: "Newco (Acquired)", status: "Onboarding", score: "—", badge: "bg-yellow-50 text-yellow-700" },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-white border border-gray-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{row.client}</p>
                    <p className="text-xs text-gray-400">{row.status}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.badge}`}>
                    {row.score !== "—" ? `Score: ${row.score}` : "Scanning..."}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-400 text-center">Illustrative dashboard — actual data from your clients</p>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">The MSP Reality</p>
          <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight">
            Managing compliance across a client portfolio is broken
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {painPoints.map((point, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="text-base font-semibold text-gray-900">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{point.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">How It Works</p>
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Add a client. Set a policy. Monitor everything.
          </h2>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {howItWorks.map((step) => (
            <div key={step.step}>
              <span className="text-5xl font-bold text-gray-100">{step.step}</span>
              <h3 className="mt-2 text-base font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">Use Cases</p>
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Built for how MSPs actually work
          </h2>
          <div className="mt-12 grid gap-8 lg:grid-cols-3">
            {useCases.map((uc, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6">
                <span className="text-xs font-semibold text-gray-400">{uc.badge}</span>
                <h3 className="mt-2 text-lg font-semibold text-gray-900">{uc.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-500">{uc.desc}</p>
                <p className="mt-4 text-xs font-medium text-gray-400">{uc.cta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400 text-center">
          From MSPs Using Scantient
        </p>
        <h2 className="text-center text-3xl font-bold leading-tight tracking-tight">
          What MSP operators say
        </h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {testimonials.map((t, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
              <p className="text-sm leading-relaxed text-gray-700 italic">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-6 border-t border-gray-200 pt-4">
                <p className="text-sm font-semibold text-gray-900">{t.author}</p>
                <p className="text-xs text-gray-400">{t.company}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-gray-400">
          Testimonials are representative of feedback received from MSP partners. Details anonymized.
        </p>
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
          <h2 className="text-3xl font-bold">Ready to scale compliance across your client portfolio?</h2>
          <p className="mx-auto mt-4 max-w-xl text-gray-500">
            Ready to get started? Our MSP partnerships team is
            available to discuss volume pricing, white-label options, and onboarding support.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-lg bg-black px-8 py-3.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              Get started
            </Link>
            <Link
              href="/contact"
              className="rounded-lg border border-gray-200 px-8 py-3.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              MSP Partnership Inquiry
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-400">
            Multi-tenant · White-label reporting · Volume pricing available
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
