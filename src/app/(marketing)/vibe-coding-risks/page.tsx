import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "The Hidden Security Risks of Vibe Coding | Scantient",
  description:
    "Vibe coding is transforming software development, but it introduces serious security blind spots. Learn the risks CISOs and IT leaders need to understand.",
};

const risks = [
  {
    title: "Confidently Wrong Security Patterns",
    body: "AI models generate code that looks professional and well-structured, but frequently implements security anti-patterns. Client-side authentication, permissive CORS, disabled Row Level Security: these appear in polished, well-commented code that passes casual review. The danger isn't that AI writes bad code. It's that the bad code looks indistinguishable from good code.",
  },
  {
    title: "The Knowledge Gap Problem",
    body: "Vibe coding democratizes development; that's the appeal. But the people building these apps often lack the security knowledge to evaluate what the AI generates. A marketing manager building an internal tool doesn't know to check for SQL injection. A sales leader creating a customer portal doesn't understand CORS implications. The builders aren't negligent; they're operating outside their expertise.",
  },
  {
    title: "Velocity Without Oversight",
    body: "Traditional development has natural checkpoints: code review, QA, staging environments, security scans in CI/CD. Vibe coding bypasses all of them. An employee goes from idea to production deployment in an afternoon, without IT ever knowing the app exists. By the time you discover it, it's processing customer data.",
  },
  {
    title: "Dependency Sprawl",
    body: "AI code generators install packages liberally. A simple CRUD app might pull in 200+ dependencies. Each one is a potential supply chain attack vector. Worse, AI tools often suggest outdated or deprecated packages because their training data lags behind the npm registry. Your attack surface grows with every prompt.",
  },
  {
    title: "Secrets in Plain Sight",
    body: "AI assistants routinely suggest storing API keys in NEXT_PUBLIC_ environment variables, embedding credentials in client-side code, or committing .env files to repositories. These patterns appear in training data because they work during development. But in production, they expose secrets to every visitor who opens DevTools.",
  },
  {
    title: "The Compliance Blind Spot",
    body: "SOC 2, HIPAA, GDPR: your compliance obligations don't have a carve-out for AI-generated code. But vibe-coded apps typically lack audit logs, proper data handling, access controls, and encryption at rest. When the auditor asks how you govern AI-generated applications, silence isn't an acceptable answer.",
  },
  {
    title: "Shadow IT at Scale",
    body: "Before AI coding tools, shadow IT was limited by technical skill. Now anyone with a browser deploys a production web application. The scale of ungoverned applications in organizations is growing exponentially. A 500-person company might have 20-50 AI-built apps running in production without IT's knowledge.",
  },
];

export default function VibeCodingRisksPage() {
  return (
    <div className="bg-white">
      <MarketingNav />

      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">Industry Analysis</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          The Hidden Security Risks of Vibe Coding
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-gray-500">
          Vibe coding (using AI to generate entire applications from natural language prompts) is the fastest-growing trend in software development. Tools like Cursor, Lovable, Bolt, and Replit are enabling non-developers to ship production applications in hours. But with that speed comes a category of security risks that most organizations aren&apos;t prepared for.
        </p>

        <div className="mt-16 space-y-14">
          {risks.map((risk, i) => (
            <div key={i}>
              <h2 className="text-2xl font-semibold">{risk.title}</h2>
              <p className="mt-4 leading-relaxed text-gray-600">{risk.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-20">
          <h2 className="text-2xl font-semibold">What IT Leaders Should Do Now</h2>
          <div className="mt-6 space-y-4 text-gray-600">
            <p><strong>1. Acknowledge the reality.</strong> Your organization is already vibe coding. The question isn&apos;t whether to allow it; it&apos;s how to govern it.</p>
            <p><strong>2. Create an inventory.</strong> Start by cataloging every AI-generated application deployed in your organization. You won&apos;t secure what you won&apos;t see.</p>
            <p><strong>3. Establish a baseline.</strong> Define minimum security requirements for AI-generated apps: security headers, authentication patterns, secrets management, dependency hygiene.</p>
            <p><strong>4. Automate monitoring.</strong> Manual audits don&apos;t scale. Implement continuous automated scanning that checks every app against your security baseline, without requiring developer involvement.</p>
            <p><strong>5. Make security accessible.</strong> When you find a vulnerability, provide plain-language remediation guidance. The builders aren&apos;t security experts; meet them where they are.</p>
          </div>
        </div>

        <div className="mt-20 rounded-2xl bg-gray-50 p-8 text-center">
          <h2 className="text-2xl font-bold">Get visibility into your AI app portfolio</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-gray-500">
            Scantient continuously monitors every AI-generated application in your organization for security vulnerabilities, misconfigurations, and compliance gaps. No SDK required.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-black px-8 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Start 14-day free trial
          </Link>
        </div>

        <div className="mt-12 flex gap-4 text-sm">
          <Link href="/security-checklist" className="text-gray-500 hover:text-black transition-colors">← Security Checklist</Link>
          <span className="text-gray-300">|</span>
          <Link href="/compliance" className="text-gray-500 hover:text-black transition-colors">Compliance Monitoring →</Link>
        </div>
      </article>

      <Footer />
    </div>
  );
}
