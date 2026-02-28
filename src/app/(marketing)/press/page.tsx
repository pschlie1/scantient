import type { Metadata } from "next";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "Press — VibeSafe",
  description: "Press resources, brand assets, and media inquiries for VibeSafe.",
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
    headline: "The shadow IT problem just got worse — meet the AI app",
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
    <div className="bg-white">
      <MarketingNav />

      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">Press</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Media resources
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-gray-500">
          For press inquiries, interviews, or to request a briefing, contact{" "}
          <a href="mailto:press@vibesafe.app" className="text-black underline hover:no-underline">
            press@vibesafe.app
          </a>.
        </p>

        {/* Company snapshot */}
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-gray-400">{f.label}</p>
              <p className="mt-1 font-semibold text-gray-900">{f.value}</p>
            </div>
          ))}
        </div>

        {/* Boilerplate */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold">About VibeSafe (boilerplate)</h2>
          <div className="mt-4 rounded-xl bg-gray-50 p-6 text-sm leading-relaxed text-gray-600">
            <p>
              VibeSafe is the AI-generated application security platform built for IT Directors and CISOs.
              As AI coding tools enable employees across every department to build and deploy production
              software without developer oversight, VibeSafe provides continuous security monitoring,
              compliance evidence, and automated remediation guidance for the apps IT didn&apos;t commission
              but is now responsible for. Founded in 2025, VibeSafe is headquartered in Chicago, Illinois.
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
                className="block rounded-xl border border-gray-100 p-5 transition hover:border-gray-200 hover:bg-gray-50"
              >
                <p className="text-xs font-medium uppercase tracking-widest text-gray-400">
                  {item.outlet} · {item.date}
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800">{item.headline}</p>
              </a>
            ))}
          </div>
        </div>

        {/* Brand assets */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold">Brand assets</h2>
          <p className="mt-3 text-sm text-gray-500">
            Logos, screenshots, and brand guidelines are available on request. Email{" "}
            <a href="mailto:press@vibesafe.app" className="text-black underline hover:no-underline">
              press@vibesafe.app
            </a>{" "}
            and we&apos;ll send a press kit within one business day.
          </p>
        </div>
      </article>

      <Footer />
    </div>
  );
}
