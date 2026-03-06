"use client";
import { useState } from "react";
import Link from "next/link";
import Footer from "@/components/footer";

type Tier = {
  name: string;
  price: string;
  period?: string;
  annualPrice?: string;
  annualSavings?: string;
  desc: string;
  outcomeHeading?: string;
  outcomeSubheading?: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted: boolean;
};

const tiers: Tier[] = [
  {
    name: "Lifetime Deal",
    price: "$79",
    period: "",
    annualPrice: "$79",
    annualSavings: "one-time",
    desc: "Ship before your users find your security holes",
    outcomeHeading: "Ship Before Your Users Find Your Security Holes",
    outcomeSubheading: "One scan. 30 seconds. 'Safe to deploy' or 'fix these 3 things.'",
    features: [
      "Unlimited apps (lifetime)",
      "Unlimited team members",
      "Unlimited scans",
      "All 20 security checks",
      "Pre-deploy scanning (CLI / GitHub Action)",
      "Slack/email alerts",
      "Perfect for indie hackers & founders",
    ],
    cta: "Claim your $79 deal",
    ctaHref: "/signup?plan=ltd",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$399",
    period: "/month",
    annualPrice: "$4,188",
    annualSavings: "save $588/year",
    desc: "Compliance on autopilot",
    outcomeHeading: "Compliance On Autopilot",
    outcomeSubheading: "Continuous verification + monthly audit reports. Your auditors will love you.",
    features: [
      "15 monitored apps",
      "5 team members",
      "Hourly automated scans",
      "All 20 security checks",
      "Jira integration (auto-creates tickets)",
      "Slack & email alerts",
      "Monthly PDF compliance reports",
      "Auto-suppress known-safe items",
      "Team collaboration & visibility",
      "Audit log of every scan",
    ],
    cta: "Start Pro subscription",
    ctaHref: "/signup?plan=pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    annualPrice: "Custom",
    annualSavings: "",
    desc: "Security compliance that scales",
    outcomeHeading: "Security Compliance That Scales",
    outcomeSubheading: "Custom rules. Board-ready dashboards. Prove security to auditors, board, and customers.",
    features: [
      "Unlimited apps",
      "Unlimited team members",
      "Hourly scans + custom schedules",
      "All 20 security checks + custom rules",
      "Custom rule engine for compliance",
      "Automated incident escalation",
      "Board-ready quarterly reports",
      "Full audit logs & decision tracking",
      "Guaranteed response SLA",
      "White-glove support & strategy reviews",
      "Custom integrations (Splunk, Datadog, Okta)",
      "SSO / SAML / LDAP",
    ],
    cta: "Contact sales",
    ctaHref: "mailto:sales@scantient.com",
    highlighted: false,
  },
];

const faqs = [
  {
    q: "Can I switch plans later?",
    a: "Yes. You can upgrade, downgrade, or cancel your subscription anytime. Annual plans can be adjusted on renewal.",
  },
  {
    q: "Is there a free trial?",
    a: "Pro and Enterprise plans include a free 7-day trial. Lifetime Deal is a one-time purchase with 30-day money-back guarantee.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards (Visa, Mastercard, American Express) and wire transfers for Enterprise plans.",
  },
  {
    q: "Can I get a custom plan?",
    a: "Absolutely. Contact our sales team at sales@scantient.com to discuss custom pricing, volume discounts, or special requirements.",
  },
  {
    q: "Do you offer annual discounts?",
    a: "Yes. Pro plans save up to 20% when billed annually. Enterprise customers can negotiate custom annual rates.",
  },
  {
    q: "What happens after the free trial?",
    a: "Your trial ends and you'll need to add a payment method to continue. We'll send reminders before trial expiry.",
  },
  {
    q: "Is there a minimum contract length?",
    a: "No. All monthly plans can be canceled anytime. Annual plans renew after 12 months.",
  },
  {
    q: "Who should choose which plan?",
    a: "Lifetime Deal: Indie hackers & solo devs. Pro: CTOs at SMBs (50-500 people). Enterprise: Mid-market with auditor/compliance needs.",
  },
];

const featureMatrix = [
  {
    name: "Monitored Apps",
    ltd: "Unlimited",
    pro: "15",
    enterprise: "Unlimited",
  },
  {
    name: "Team Members",
    ltd: "Unlimited",
    pro: "5",
    enterprise: "Unlimited",
  },
  {
    name: "Scan Frequency",
    ltd: "Manual / pre-deploy",
    pro: "Hourly",
    enterprise: "Hourly + custom schedules",
  },
  {
    name: "Security Checks",
    ltd: "All 20",
    pro: "All 20",
    enterprise: "All 20 + custom rules",
  },
  {
    name: "CLI / GitHub Action",
    ltd: "✓",
    pro: "✓",
    enterprise: "✓",
  },
  {
    name: "Slack & Email Alerts",
    ltd: "✓",
    pro: "✓",
    enterprise: "✓",
  },
  {
    name: "Jira Integration",
    ltd: "—",
    pro: "✓ (auto-tickets)",
    enterprise: "✓ (auto-tickets + custom workflows)",
  },
  {
    name: "Monthly Compliance Reports",
    ltd: "—",
    pro: "✓",
    enterprise: "✓ (board-ready quarterly)",
  },
  {
    name: "Auto-Suppress Known-Safe",
    ltd: "—",
    pro: "✓",
    enterprise: "✓",
  },
  {
    name: "Custom Rule Engine",
    ltd: "—",
    pro: "—",
    enterprise: "✓",
  },
  {
    name: "Incident Escalation",
    ltd: "—",
    pro: "—",
    enterprise: "✓",
  },
  {
    name: "Audit Logs",
    ltd: "—",
    pro: "✓",
    enterprise: "✓ (full decision tracking)",
  },
  {
    name: "SLA Guarantee",
    ltd: "—",
    pro: "—",
    enterprise: "✓",
  },
  {
    name: "Support",
    ltd: "Community",
    pro: "Email",
    enterprise: "White-glove + quarterly reviews",
  },
  {
    name: "Custom Integrations",
    ltd: "—",
    pro: "—",
    enterprise: "✓",
  },
];

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <>
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
              <Link href="/security-checklist" className="hidden text-sm font-medium text-dusty-denim-700 transition-colors hover:text-ink-black-950 sm:block">
                Resources
              </Link>
              <Link href="/" className="hidden text-sm font-medium text-dusty-denim-700 transition-colors hover:text-ink-black-950 sm:block">
                Home
              </Link>
              <Link href="/login" className="text-sm font-medium text-dusty-denim-700 transition-colors hover:text-ink-black-950">
                Sign in
              </Link>
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
              Choose your <br />
              <span className="text-prussian-blue-600">security outcome tier</span>
            </h1>
            <p className="mx-auto mt-8 max-w-[600px] text-lg leading-relaxed text-dusty-denim-700">
              Every plan includes all 20 security checks. Choose based on your scale, compliance needs, and team size.
            </p>
          </div>
        </section>

        {/* Pricing cards */}
        <section className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
          {/* Monthly/Annual Toggle */}
          <div className="mb-12 flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${!isAnnual ? "text-ink-black-950" : "text-dusty-denim-600"}`}>Monthly</span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                isAnnual ? "bg-prussian-blue-600" : "bg-alabaster-grey-200"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  isAnnual ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${isAnnual ? "text-ink-black-950" : "text-dusty-denim-600"}`}>Annual</span>
            {isAnnual && <span className="ml-2 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Save up to 20%</span>}
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl p-6 sm:p-8 transition-transform duration-200 hover:-translate-y-1 ${
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
                {tier.outcomeHeading && (
                  <h2 className={`mb-3 text-base font-bold ${tier.highlighted ? "text-white" : "text-ink-black-950"}`}>
                    {tier.outcomeHeading}
                  </h2>
                )}
                {tier.outcomeSubheading && (
                  <p className={`mb-4 text-xs ${tier.highlighted ? "text-alabaster-grey-200" : "text-dusty-denim-600"}`}>
                    {tier.outcomeSubheading}
                  </p>
                )}
                <h3 className={`text-lg font-bold ${tier.highlighted ? "text-white" : "text-ink-black-950"}`}>{tier.name}</h3>
                <div className="mt-3">
                  <span className={`text-4xl font-extrabold tracking-tight ${tier.highlighted ? "text-white" : "text-ink-black-950"}`}>
                    {isAnnual ? tier.annualPrice : tier.price}
                  </span>
                  {!isAnnual && <span className={tier.highlighted ? "text-alabaster-grey-200" : "text-dusty-denim-600"}>/month</span>}
                  {isAnnual && tier.annualSavings && (
                    <div className={`text-xs font-semibold ${tier.highlighted ? "text-emerald-300" : "text-emerald-600"}`}>
                      {tier.annualSavings}
                    </div>
                  )}
                </div>
                <p className={`mt-3 text-sm ${tier.highlighted ? "text-alabaster-grey-200" : "text-dusty-denim-600"}`}>{tier.desc}</p>
                <Link
                  href={tier.ctaHref}
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

        {/* Feature Comparison Table */}
        <section className="border-y border-alabaster-grey-200 bg-white px-6 py-24 sm:py-32">
          <div className="mx-auto max-w-[1200px]">
            <h2 className="mb-16 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">Feature comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-alabaster-grey-200">
                    <th className="px-4 py-4 text-left font-semibold text-ink-black-950">Feature</th>
                    <th className="px-4 py-4 text-center font-semibold text-ink-black-950">Lifetime Deal</th>
                    <th className="px-4 py-4 text-center font-semibold text-ink-black-950">Pro</th>
                    <th className="px-4 py-4 text-center font-semibold text-ink-black-950">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {featureMatrix.map((row, idx) => (
                    <tr key={row.name} className={`border-b border-alabaster-grey-200 ${idx % 2 === 1 ? "bg-alabaster-grey-50" : ""}`}>
                      <td className="px-4 py-4 font-medium text-dusty-denim-900">{row.name}</td>
                      <td className="px-4 py-4 text-center text-dusty-denim-600">{row.ltd}</td>
                      <td className="px-4 py-4 text-center text-dusty-denim-600">{row.pro}</td>
                      <td className="px-4 py-4 text-center text-dusty-denim-600">{row.enterprise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-alabaster-grey-200 bg-white px-6 py-24 sm:py-32">
          <div className="mx-auto max-w-[800px]">
            <h2 className="mb-16 text-center text-3xl font-extrabold tracking-[-0.02em] text-ink-black-950 sm:text-4xl">Pricing FAQ</h2>
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
          <h2 className="text-3xl font-extrabold tracking-[-0.02em] text-white sm:text-4xl">
            Still have questions?
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-alabaster-grey-200">
            Our team is happy to help. Contact sales for custom pricing, volume discounts, or integration requests.
          </p>
          <div className="mt-10 flex flex-col gap-3 items-center sm:flex-row sm:justify-center">
            <Link
              href="mailto:sales@scantient.com"
              className="rounded-lg bg-white px-8 py-3.5 text-sm font-semibold text-ink-black-950 transition-colors hover:bg-alabaster-grey-100"
            >
              Contact sales
            </Link>
            <Link
              href="/signup"
              className="rounded-lg border border-white px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Start free
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
