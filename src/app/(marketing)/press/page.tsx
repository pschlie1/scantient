import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Press — Scantient",
  description: "Press resources, brand assets, and media inquiries for Scantient.",
};

const coverage = [
  {
    outlet: "TechCrunch",
    headline: "As vibe coding explodes, startups race to secure the apps no one is watching",
    date: "February 2026",
    url: "#",
  },
  {
    outlet: "Dark Reading",
    headline: "The shadow IT problem just got worse. Meet the AI app",
    date: "January 2026",
    url: "#",
  },
  {
    outlet: "CSO Online",
    headline: "IT Directors are losing the race against AI-generated applications",
    date: "December 2025",
    url: "#",
  },
];

const facts = [
  { label: "Founded", value: "2025" },
  { label: "Headquarters", value: "Chicago, IL" },
  { label: "Stage", value: "Seed" },
  { label: "Focus", value: "AI App Security" },
];

export default function PressPage() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-muted">Press</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Media resources
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          For press inquiries, interviews, or to request a briefing, contact{" "}
          <a href="mailto:press@scantient.com" className="text-heading underline hover:no-underline">
            press@scantient.com
          </a>.
        </p>

        {/* Company snapshot */}
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="rounded-xl border border-border p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-muted">{f.label}</p>
              <p className="mt-1 font-semibold text-heading">{f.value}</p>
            </div>
          ))}
        </div>

        {/* Boilerplate */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold">About Scantient (boilerplate)</h2>
          <div className="mt-4 rounded-xl bg-surface-raised p-6 text-sm leading-relaxed text-body">
            <p>
              Scantient is the AI-generated application security platform built for IT Directors and CISOs.
              As AI coding tools enable employees across every department to build and deploy production
              software without developer oversight, Scantient provides continuous security monitoring,
              compliance evidence, and automated remediation guidance for the apps IT didn&apos;t commission
              but is now responsible for. Founded in 2025, Scantient is headquartered in Chicago, Illinois.
            </p>
          </div>
        </div>

        {/* Coverage */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold">Recent coverage</h2>
          <div className="mt-4 space-y-3">
            {coverage.map((item) => (
              <a
                key={item.headline}
                href={item.url}
                className="block rounded-xl border border-border p-5 transition hover:border-border hover:bg-surface-raised"
              >
                <p className="text-xs font-medium uppercase tracking-widest text-muted">
                  {item.outlet} · {item.date}
                </p>
                <p className="mt-1 text-sm font-medium text-heading">{item.headline}</p>
              </a>
            ))}
          </div>
        </div>

        {/* Brand assets */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold">Brand assets</h2>
          <p className="mt-3 text-sm text-muted">
            Logos, screenshots, and brand guidelines are available on request. Email{" "}
            <a href="mailto:press@scantient.com" className="text-heading underline hover:no-underline">
              press@scantient.com
            </a>{" "}
            and we&apos;ll send a press kit within one business day.
          </p>
        </div>
      </article>

    </>
  );
}
