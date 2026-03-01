import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "Help Center — Scantient",
  description: "Answers to common questions about Scantient, security scanning, and account management.",
};

const faqs = [
  {
    section: "Getting started",
    items: [
      {
        q: "How do I add an application to monitor?",
        a: "After signing in, go to your Dashboard and click 'Add App'. Enter the public URL of the application you want to monitor. Scantient will immediately run an initial security scan and begin continuous monitoring.",
      },
      {
        q: "What does Scantient actually scan?",
        a: "Scantient performs HTTP-based security checks including: security headers (CSP, HSTS, X-Frame-Options), exposed API keys or credentials in JavaScript, client-side authentication bypass patterns, CORS misconfiguration, cookie security settings, SSL certificate validity and expiry, open redirects, information disclosure, and dependency exposure signals.",
      },
      {
        q: "Does Scantient need access to my source code?",
        a: "No. Scantient operates entirely from the outside — the same way an attacker would. We scan your app's public endpoints without requiring a code integration, repository access, or deployment pipeline changes.",
      },
      {
        q: "How long does a scan take?",
        a: "Initial scans typically complete in 30–90 seconds depending on the application. Continuous scans run in the background on your configured schedule (default: every 6 hours).",
      },
    ],
  },
  {
    section: "Security & findings",
    items: [
      {
        q: "What do the severity levels mean?",
        a: "Critical: Immediate action required — active vulnerability that could lead to data breach or takeover. High: Fix within 24–48 hours. Medium: Remediate in current sprint. Low: Informational — address when possible. Info: Best-practice improvement, no active risk.",
      },
      {
        q: "I got a false positive — what do I do?",
        a: "Open the finding and click 'Mark as False Positive'. We'll ask for a brief note explaining why. False positives are reviewed by our team to improve scanner accuracy. The finding will be suppressed from your score and future reports.",
      },
      {
        q: "Why does my app have a low security score if nothing looks broken?",
        a: "Security score reflects missing protections, not just active vulnerabilities. Missing security headers, absent Content-Security-Policy, or cookies without Secure/HttpOnly flags all reduce your score even if no active attack is occurring. These gaps make your app easier to exploit.",
      },
    ],
  },
  {
    section: "Billing & account",
    items: [
      {
        q: "How does the 14-day free trial work?",
        a: "You get full access to all features for 14 days, no credit card required. At the end of the trial you can choose a plan or your account will revert to a read-only view of your scan history.",
      },
      {
        q: "Can I change plans at any time?",
        a: "Yes. You can upgrade or downgrade at any time from Settings → Billing. Upgrades take effect immediately; downgrades take effect at the next billing cycle.",
      },
      {
        q: "Do you offer discounts for nonprofits or educational institutions?",
        a: "Yes — contact us at support@scantient.com with verification and we'll apply a discount to your account.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="bg-white">
      <MarketingNav />

      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">Help Center</p>
        <h1 className="text-4xl font-bold tracking-tight">How can we help?</h1>
        <p className="mt-4 text-lg text-gray-500">
          Common questions about Scantient. Can&apos;t find what you&apos;re looking for?{" "}
          <Link href="/contact" className="text-black underline hover:no-underline">
            Contact us
          </Link>.
        </p>

        <div className="mt-16 space-y-16">
          {faqs.map((section) => (
            <div key={section.section}>
              <h2 className="text-xl font-semibold text-gray-900">{section.section}</h2>
              <div className="mt-6 space-y-8">
                {section.items.map((item) => (
                  <div key={item.q}>
                    <h3 className="font-medium text-gray-900">{item.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-20 rounded-2xl bg-gray-50 p-8 text-center">
          <h2 className="text-xl font-bold">Still have questions?</h2>
          <p className="mt-2 text-sm text-gray-500">
            Our team typically responds within one business day.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link
              href="/contact"
              className="rounded-lg bg-black px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              Contact support
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              View API docs
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
