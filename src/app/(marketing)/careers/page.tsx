import type { Metadata } from "next";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "Careers — Scantient",
  description: "Join Scantient and help build security infrastructure for the AI era.",
};

const openRoles = [
  {
    title: "Senior Full-Stack Engineer",
    team: "Engineering",
    type: "Full-time · Remote",
    desc: "Own core scanner infrastructure and help us build the next generation of security monitoring tooling. Strong TypeScript, Next.js, and distributed systems experience required.",
  },
  {
    title: "Security Research Engineer",
    team: "Security",
    type: "Full-time · Remote",
    desc: "Research emerging attack patterns in AI-generated code and translate them into new scanner detections. Background in AppSec or penetration testing preferred.",
  },
  {
    title: "Enterprise Account Executive",
    team: "Sales",
    type: "Full-time · Remote (US)",
    desc: "Own enterprise deals from first call to close. Experience selling security or compliance SaaS to IT Directors and CISOs at mid-market companies.",
  },
];

const perks = [
  { emoji: "🌍", label: "Fully remote" },
  { emoji: "💰", label: "Competitive equity" },
  { emoji: "🏥", label: "Full medical, dental, vision" },
  { emoji: "🗓️", label: "Unlimited PTO" },
  { emoji: "💻", label: "$2K home office stipend" },
  { emoji: "📚", label: "$1.5K/yr learning budget" },
];

export default function CareersPage() {
  return (
    <div className="bg-white">
      <MarketingNav />

      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">Careers</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Build security for<br />the AI era
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-gray-500">
          Scantient is a small, focused team solving a real problem: organizations are deploying AI-generated applications faster than IT can track or secure them. We&apos;re building the infrastructure to fix that.
        </p>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">Why Scantient</h2>
          <div className="mt-6 space-y-4 leading-relaxed text-gray-600">
            <p>
              We&apos;re at an inflection point in how software gets built. AI coding tools have put production deployments in the hands of every employee — and IT teams are scrambling to maintain visibility and control. We&apos;re building the platform that solves this.
            </p>
            <p>
              We&apos;re early, opinionated, and moving fast. If you want to work on hard problems with real stakes alongside people who&apos;ve shipped production security infrastructure before, this is the place.
            </p>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">Benefits</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {perks.map((perk) => (
              <div key={perk.label} className="flex items-center gap-3 rounded-xl border border-gray-100 p-4">
                <span className="text-xl">{perk.emoji}</span>
                <span className="text-sm text-gray-700">{perk.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-semibold">Open roles</h2>
          <div className="mt-6 space-y-4">
            {openRoles.map((role) => (
              <div key={role.title} className="rounded-2xl border border-gray-100 p-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{role.title}</h3>
                    <div className="mt-1 flex gap-3 text-xs text-gray-400">
                      <span>{role.team}</span>
                      <span>·</span>
                      <span>{role.type}</span>
                    </div>
                  </div>
                  <a
                    href={`mailto:careers@scantient.com?subject=Application: ${role.title}`}
                    className="mt-3 inline-block shrink-0 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors sm:mt-0"
                  >
                    Apply
                  </a>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-gray-500">{role.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-2xl bg-gray-50 p-6">
          <p className="text-sm text-gray-600">
            Don&apos;t see the right role?{" "}
            <a href="mailto:careers@scantient.com" className="font-medium text-black underline hover:no-underline">
              Send us a note anyway.
            </a>{" "}
            We&apos;re always interested in strong engineers and security researchers.
          </p>
        </div>
      </article>

      <Footer />
    </div>
  );
}
