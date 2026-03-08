import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — Scantient",
  description: "Get in touch with the Scantient team.",
};

const channels = [
  {
    label: "General inquiries",
    email: "hello@scantient.com",
    desc: "Questions about Scantient, pricing, or how we can help your organization.",
  },
  {
    label: "Support",
    email: "support@scantient.com",
    desc: "Help with your account, billing, or technical issues.",
  },
  {
    label: "Security disclosures",
    email: "security@scantient.com",
    desc: "Responsible disclosure of security vulnerabilities. We respond within 24 hours.",
  },
  {
    label: "Press & media",
    email: "press@scantient.com",
    desc: "Interview requests, press kit, or media briefings.",
  },
];

export default function ContactPage() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-muted">Contact</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Get in touch</h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          We&apos;re a small team and we read everything. Reach out to the right inbox and we&apos;ll get back to you quickly.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {channels.map((ch) => (
            <a
              key={ch.email}
              href={`mailto:${ch.email}`}
              className="group block rounded-2xl border border-border p-6 transition hover:border-border hover:bg-surface-raised"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">{ch.label}</p>
              <p className="mt-2 font-medium text-heading group-hover:underline">{ch.email}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{ch.desc}</p>
            </a>
          ))}
        </div>

        <div className="mt-16">
          <h2 className="text-lg font-semibold">Schedule a demo</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Prefer to talk through your situation? Email{" "}
            <a href="mailto:hello@scantient.com" className="text-heading underline hover:no-underline">
              hello@scantient.com
            </a>{" "}
            with a brief description of your environment (number of AI-built apps, compliance obligations, and team size), and we&apos;ll set up a call within 48 hours.
          </p>
        </div>

        <div className="mt-16 rounded-2xl bg-surface-raised p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Response times</p>
          <div className="mt-4 space-y-2 text-sm text-body">
            <div className="flex justify-between"><span>Support</span><span className="font-medium">1 business day</span></div>
            <div className="flex justify-between"><span>Sales / demos</span><span className="font-medium">1–2 business days</span></div>
            <div className="flex justify-between"><span>Security disclosures</span><span className="font-medium">24 hours</span></div>
            <div className="flex justify-between"><span>Press inquiries</span><span className="font-medium">1 business day</span></div>
          </div>
        </div>
      </article>

    </>
  );
}
