import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Your Engineering Team Probably Has No AI Usage Policy (And Why That's a Security Problem) | Scantient",
  description:
    "Most engineering teams use 10+ AI tools with zero formal policy. Learn why shadow AI is a compliance time bomb and what your AI usage policy actually needs to say.",
  keywords: "ai tool usage policy engineering teams, AI compliance for startups, shadow AI detection",
  openGraph: {
    title: "Your Engineering Team Probably Has No AI Usage Policy (And Why That's a Security Problem)",
    description:
      "Most engineering teams use 10+ AI tools with zero formal policy. Learn why shadow AI is a compliance time bomb and what your AI usage policy actually needs to say.",
    url: "https://scantient.com/blog/ai-policy-compliance-engineering",
    siteName: "Scantient",
    type: "article",
    publishedTime: "2026-03-02T00:00:00Z",
  },
  twitter: {
    card: "summary_large_image",
    title: "Your Engineering Team Probably Has No AI Usage Policy (And Why That's a Security Problem)",
    description:
      "Most engineering teams use 10+ AI tools with zero formal policy. Learn why shadow AI is a compliance time bomb and what your AI usage policy actually needs to say.",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is shadow AI in engineering teams?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Shadow AI refers to AI tools and models used by employees without IT's knowledge or approval — tools like ChatGPT, GitHub Copilot, Cursor, or Claude that engineers use daily but that haven't been vetted, approved, or monitored by the organization. Like shadow IT before it, shadow AI creates compliance gaps and data exposure risks.",
      },
    },
    {
      "@type": "Question",
      name: "What should an AI usage policy for engineers include?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A strong AI usage policy should cover: approved tools (an explicit allowlist), prohibited data types (no PII, no credentials, no proprietary code in unapproved tools), output review requirements, IP ownership considerations, audit logging expectations, and a clear process for requesting approval of new AI tools.",
      },
    },
    {
      "@type": "Question",
      name: "How does shadow AI create compliance failures?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When engineers paste code, customer data, or internal documentation into unapproved AI tools, that data may be used to train models or stored on third-party servers outside your data processing agreements. This can violate GDPR, HIPAA, SOC 2, and other frameworks — and your auditors will ask about it.",
      },
    },
    {
      "@type": "Question",
      name: "How can startups enforce AI compliance without slowing down engineers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective approach combines a clear, permissive allowlist (engineers can use approved tools freely) with automated scanning to detect unapproved tool usage through browser extensions, DNS monitoring, or endpoint agents. Scantient can detect AI tool usage patterns across your organization and flag policy gaps without requiring manual audits.",
      },
    },
    {
      "@type": "Question",
      name: "How many AI tools does the average engineering team use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Research suggests the average engineering team uses 8–15 distinct AI tools — ranging from code assistants like Copilot and Cursor to general LLMs like ChatGPT and Claude, image generators, and specialized AI coding agents. Most organizations have formal policies covering fewer than 2 of them.",
      },
    },
  ],
};

const checklist = [
  {
    item: "Approved tools list",
    detail: "A living document of every AI tool officially sanctioned for use, with data classification limits for each.",
  },
  {
    item: "Data handling rules",
    detail: "Explicit prohibitions on pasting PII, credentials, source code from closed-source products, or customer data into unapproved tools.",
  },
  {
    item: "Output review requirements",
    detail: "AI-generated code must be reviewed and understood by a human before merging — 'AI wrote it' is not an excuse for skipping security review.",
  },
  {
    item: "IP and licensing",
    detail: "Policy on AI-generated code ownership, open-source license contamination risk, and attribution requirements.",
  },
  {
    item: "Incident reporting",
    detail: "Clear process for reporting suspected data leakage via AI tools — including what counts as an incident.",
  },
  {
    item: "New tool approval process",
    detail: "A fast path for engineers to request new tools (slow approval kills adoption of the policy). Target 48-hour turnaround.",
  },
  {
    item: "Audit logging",
    detail: "Requirement to maintain logs of what AI tools are used and for what purpose — essential for compliance evidence.",
  },
];

export default function AIPolicyComplianceBlogPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-muted">
          AI Compliance · March 2026
        </p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Your Engineering Team Probably Has No AI Usage Policy (And Why That&apos;s a Security Problem)
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          Ask your engineers how many AI tools they use daily. GitHub Copilot, ChatGPT, Claude, Cursor, Codeium,
          Tabnine, Gemini, Perplexity — the list adds up fast. The average engineering team is running 10 or more.
          Now ask how many of those tools are covered by a formal usage policy. For most organizations, the answer is zero.
        </p>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">The Shadow AI Problem Is Already Here</h2>
          <div className="mt-6 space-y-4 leading-relaxed text-body">
            <p>
              Shadow IT — employees using unapproved software — has been a compliance headache for decades. But
              shadow AI is shadow IT on steroids. The barrier to using a new AI tool is a browser tab, not a
              software install. Engineers don&apos;t think of opening Claude.ai as a security decision. It just feels
              like using a search engine.
            </p>
            <p>
              But it&apos;s not a search engine. When an engineer pastes a function signature, a database schema, or
              a stack trace into ChatGPT to debug a production issue, that data leaves your environment. It may
              be used for model training. It&apos;s stored on servers outside your data processing agreements.
              If that code touches customer records, you may have just created a GDPR incident — without anyone
              realizing it.
            </p>
            <p>
              And that&apos;s the optimistic scenario. The pessimistic one involves credentials.
            </p>
          </div>
        </div>

        <div className="mt-14">
          <h2 className="text-2xl font-semibold">The Real Risks: Data Exposure, Compliance Failures, Audit Nightmares</h2>
          <div className="mt-6 space-y-6 leading-relaxed text-body">
            <div>
              <h3 className="text-lg font-semibold text-heading">Data Exposure</h3>
              <p className="mt-2">
                Engineers routinely paste proprietary code, internal documentation, and customer data into AI
                tools to get better answers. Most AI providers use this data to improve their models unless you
                have an enterprise plan with explicit data retention controls. The free tier of every major LLM
                almost certainly uses your data. Your engineers are almost certainly on the free tier.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-heading">Compliance Failures</h3>
              <p className="mt-2">
                SOC 2 requires you to maintain controls over where data goes. GDPR requires data processing
                agreements with any service that touches EU personal data. HIPAA requires Business Associate
                Agreements. None of these frameworks have a &ldquo;but we didn&apos;t know&rdquo; carve-out.
                If your engineers are using AI tools that process regulated data without appropriate agreements,
                you are already non-compliant. The audit hasn&apos;t found it yet.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-heading">Audit Nightmares</h3>
              <p className="mt-2">
                When a SOC 2 auditor asks how you govern AI tool usage across your engineering team, &ldquo;we
                trust our engineers&rdquo; is not a control. Auditors want policy documentation, training
                records, monitoring evidence, and incident logs. If you&apos;re starting from zero when the
                audit begins, you&apos;re not starting from zero — you&apos;re starting from a finding.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-14">
          <h2 className="text-2xl font-semibold">What an AI Usage Policy Actually Needs</h2>
          <p className="mt-4 text-muted">
            A good AI usage policy isn&apos;t a legal wall — it&apos;s a practical guide that enables engineers
            to work efficiently while protecting the organization. Here&apos;s the checklist:
          </p>
          <div className="mt-8 space-y-4">
            {checklist.map((item, i) => (
              <div key={i} className="flex gap-4 rounded-xl border border-border p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-heading">{item.item}</p>
                  <p className="mt-1 text-sm text-muted">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14">
          <h2 className="text-2xl font-semibold">How to Enforce It (Without Becoming the Policy Police)</h2>
          <div className="mt-6 space-y-4 leading-relaxed text-body">
            <p>
              Writing a policy is the easy part. Enforcement without surveillance theater is harder. Nobody
              wants to work at a company that monitors every browser tab. Here&apos;s what actually works:
            </p>
            <p>
              <strong className="text-heading">Start with visibility, not control.</strong> Before you can
              enforce anything, you need to know what&apos;s being used. Automated scanning tools can detect
              AI tool usage patterns across your organization — which domains are being accessed, from which
              endpoints, using what credentials. This gives you a baseline without invasive monitoring.
            </p>
            <p>
              <strong className="text-heading">Make compliance the path of least resistance.</strong> If
              getting an approved AI tool takes three weeks of IT tickets, engineers will use unapproved tools.
              Set up a streamlined approval process. Build a curated list of pre-approved tools that engineers
              can use immediately. Make the approved path easier than the workaround.
            </p>
            <p>
              <strong className="text-heading">Automate audit trails.</strong> Continuous monitoring means you
              don&apos;t need point-in-time audits. Tools like Scantient can continuously scan for AI tool
              usage, flag policy gaps, and generate the audit evidence your compliance team needs — without
              requiring manual data collection or self-reported surveys (which are useless).
            </p>
            <p>
              <strong className="text-heading">Pair detection with education.</strong> When the scanner flags
              an unapproved tool, the response shouldn&apos;t be a disciplinary action — it should be a
              conversation and a faster path to getting the tool approved. Most policy violations happen
              because engineers don&apos;t know the policy exists, not because they&apos;re trying to
              circumvent controls.
            </p>
          </div>
        </div>

        <div className="mt-20 rounded-2xl bg-surface-raised p-8 text-center">
          <h2 className="text-2xl font-bold">Find out what AI tools your team is actually using</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted">
            Scantient scans your organization for AI tool usage, policy gaps, and compliance risks. Get your
            first report in minutes — no agents, no IT tickets, no disruption.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-primary px-8 py-3 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
          >
            Start Free Scan
          </Link>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">Frequently Asked Questions</h2>
          <div className="mt-8 space-y-8">
            {faqSchema.mainEntity.map((faq, i) => (
              <div key={i}>
                <h3 className="text-lg font-semibold text-heading">{faq.name}</h3>
                <p className="mt-2 leading-relaxed text-body">{faq.acceptedAnswer.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex gap-4 text-sm">
          <Link href="/vibe-coding-risks" className="text-muted hover:text-heading transition-colors">← Vibe Coding Risks</Link>
          <span className="text-muted">|</span>
          <Link href="/ai-policy-compliance" className="text-muted hover:text-heading transition-colors">AI Policy Scanner →</Link>
        </div>
      </article>

    </>
  );
}
