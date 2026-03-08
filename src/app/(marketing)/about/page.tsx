import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Scantient — Security Monitoring for AI-Built Apps",
  description:
    "Scantient helps IT Directors and CISOs maintain visibility and control over AI-generated applications deployed across their organizations.",
};

const values = [
  {
    title: "Security shouldn't require a security team",
    body: "Most mid-market companies don't have a dedicated AppSec engineer. We built Scantient so IT Directors enforce security standards across their entire app portfolio without specialized headcount.",
  },
  {
    title: "Visibility before control",
    body: "You won't secure what you won't see. Scantient starts by giving you a complete map of every AI-built app in your organization, then layers in continuous monitoring and automated remediation guidance.",
  },
  {
    title: "Built for buyers, not builders",
    body: "The people responsible for security outcomes are rarely the people who built the apps. Scantient is designed for the CIO, the CISO, and the IT Director, not the developer who shipped the code.",
  },
];

const team = [
  { initials: "PS", name: "Peter Schliesmann", title: "CEO & Co-founder", bio: "Former CIO at multiple PE-backed companies. Built Scantient after watching dozens of AI-generated apps land in production without any security review." },
  { initials: "AM", name: "Alex Morgan", title: "CTO & Co-founder", bio: "Previously led security engineering at a Series B fintech. Architected the scanning engine and continuous monitoring infrastructure." },
  { initials: "JL", name: "Jamie Lin", title: "Head of Product", bio: "Former product lead at a compliance SaaS. Obsessed with making enterprise security tools that non-technical buyers actually want to use." },
];

export default function AboutPage() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-muted">About</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Built by IT leaders,<br />for IT leaders
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          Scantient was founded in 2025 by a team of enterprise IT and security veterans who kept running into the same problem: employees were deploying AI-generated applications faster than IT could track them. By the time security found out, the apps were already processing customer data.
        </p>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">The problem we&apos;re solving</h2>
          <div className="mt-6 space-y-4 leading-relaxed text-body">
            <p>
              The rise of AI coding tools (Cursor, GitHub Copilot, Replit, Bolt) has fundamentally changed how software gets built. Employees across every department now build and deploy functional applications in hours, without any developer involvement.
            </p>
            <p>
              This is genuinely good for productivity. It&apos;s a serious problem for security. These applications process real data, serve real users, and create real compliance obligations, but they&apos;re built without security review, code standards, or IT oversight.
            </p>
            <p>
              IT Directors call it &ldquo;shadow IT on steroids.&rdquo; We built Scantient to give them back control.
            </p>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">What we believe</h2>
          <div className="mt-8 space-y-8">
            {values.map((v) => (
              <div key={v.title} className="border-l-4 border-border-subtle pl-6">
                <h3 className="font-semibold text-heading">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{v.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">The team</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {team.map((member) => (
              <div key={member.name}>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised text-sm font-bold text-body">
                  {member.initials}
                </div>
                <h3 className="mt-3 font-semibold text-heading">{member.name}</h3>
                <p className="text-xs text-muted">{member.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20 rounded-2xl bg-surface-raised p-8 text-center">
          <h2 className="text-2xl font-bold">Join us</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted">
            We&apos;re a small, focused team building security infrastructure for the AI era. If that sounds interesting,{" "}
            <Link href="/careers" className="text-heading underline hover:no-underline">we&apos;re hiring</Link>.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-primary px-8 py-3 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
          >
            Get started
          </Link>
        </div>
      </article>

    </>
  );
}
