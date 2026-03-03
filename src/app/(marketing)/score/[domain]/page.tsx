/**
 * /score/[domain] — Shareable Security Score Card
 *
 * Public, no-auth page showing a read-only security score for any monitored app.
 * Fetches the latest MonitorRun for the domain from the database and renders
 * a grade card with Open Graph meta for social sharing.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

// ─── Scoring helpers ──────────────────────────────────────────────────────────

const SEVERITY_DEDUCTION: Record<string, number> = {
  CRITICAL: 25,
  HIGH: 15,
  MEDIUM: 5,
  LOW: 2,
};

function computeScore(findings: { severity: string; status: string }[]): number {
  let score = 100;
  for (const f of findings) {
    // Only count open / in-progress / acknowledged findings against the score
    if (f.status === "RESOLVED" || f.status === "IGNORED") continue;
    score -= SEVERITY_DEDUCTION[f.severity] ?? 2;
  }
  return Math.max(0, score);
}

function computeGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

function gradeColor(grade: string): string {
  if (grade === "A" || grade === "B") return "#16a34a"; // green-600
  if (grade === "C") return "#ca8a04"; // yellow-600
  if (grade === "D") return "#ea580c"; // orange-600
  return "#dc2626"; // red-600
}

function gradeBg(grade: string): string {
  if (grade === "A" || grade === "B") return "#f0fdf4"; // green-50
  if (grade === "C") return "#fefce8"; // yellow-50
  if (grade === "D") return "#fff7ed"; // orange-50
  return "#fef2f2"; // red-50
}

function relativeDate(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// ─── Domain matching ──────────────────────────────────────────────────────────

function apexDomain(input: string): string {
  try {
    const u = input.startsWith("http") ? new URL(input) : new URL(`https://${input}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.toLowerCase().replace(/^www\./, "");
  }
}

// ─── Data fetching ────────────────────────────────────────────────────────────

interface ScoreData {
  appName: string;
  appUrl: string;
  domain: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findings: { title: string; severity: string }[];
  scannedAt: Date;
}

async function getScoreData(domainParam: string): Promise<ScoreData | null> {
  const apex = apexDomain(domainParam);

  // Fuzzy lookup: find apps whose URL contains the apex domain
  const apps = await db.monitoredApp.findMany({
    where: {
      url: { contains: apex },
    },
    include: {
      monitorRuns: {
        where: { completedAt: { not: null } },
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          findings: {
            orderBy: { severity: "asc" },
            select: { title: true, severity: true, status: true },
          },
        },
      },
    },
    take: 5,
  });

  if (apps.length === 0) return null;

  // Pick the app with the most recent completed run
  let bestApp = null as typeof apps[0] | null;
  let bestRunDate = new Date(0);

  for (const app of apps) {
    const run = app.monitorRuns[0];
    if (run?.completedAt && new Date(run.completedAt) > bestRunDate) {
      bestRunDate = new Date(run.completedAt);
      bestApp = app;
    }
  }

  if (!bestApp || !bestApp.monitorRuns[0]) return null;

  const run = bestApp.monitorRuns[0];
  const score = computeScore(run.findings);
  const grade = computeGrade(score);

  // Top 3 findings (most severe first)
  const topFindings = run.findings
    .filter((f) => f.status !== "RESOLVED" && f.status !== "IGNORED")
    .slice(0, 3)
    .map((f) => ({ title: f.title, severity: f.severity }));

  return {
    appName: bestApp.name,
    appUrl: bestApp.url,
    domain: apex,
    score,
    grade,
    findings: topFindings,
    scannedAt: run.completedAt ?? run.startedAt,
  };
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await params;
  const data = await getScoreData(domain);

  if (!data) {
    return {
      title: `${domain} — Security Score | Scantient`,
      description: `${domain} isn't currently monitored by Scantient. Scan it free to get a security grade.`,
      openGraph: {
        title: `${domain} — Not yet monitored | Scantient`,
        description: "Scan this domain free to get a security grade.",
        url: `https://scantient.com/score/${domain}`,
      },
    };
  }

  const { grade, score } = data;
  return {
    title: `${domain} — Grade ${grade} (${score}/100) | Scantient`,
    description: `${domain} has a security score of ${score}/100 (Grade ${grade}). Monitored by Scantient.`,
    openGraph: {
      title: `${domain} — Security Grade ${grade} · ${score}/100`,
      description: `This site scored ${score}/100 (Grade ${grade}) on Scantient's security scan. ${data.findings.length > 0 ? `Top issue: ${data.findings[0].title}` : "No open issues found."}`,
      url: `https://scantient.com/score/${domain}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${domain} — Security Grade ${grade} · ${score}/100`,
      description: `Scantient security score for ${domain}.`,
    },
  };
}

// ─── Severity badge ───────────────────────────────────────────────────────────

function SeverityPill({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700",
    HIGH: "bg-orange-100 text-orange-700",
    MEDIUM: "bg-yellow-100 text-yellow-700",
    LOW: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${map[severity] ?? map.LOW}`}>
      {severity}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ScoreCardPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const data = await getScoreData(domain);

  return (
    <div className="min-h-screen bg-gray-50">
      <MarketingNav />

      <main className="mx-auto max-w-xl px-4 py-16 sm:py-24">
        {data ? (
          <FoundCard data={data} />
        ) : (
          <NotFoundCard domain={domain} />
        )}
      </main>

      <Footer />
    </div>
  );
}

// ─── Found state ──────────────────────────────────────────────────────────────

function FoundCard({ data }: { data: ScoreData }) {
  const color = gradeColor(data.grade);
  const bg = gradeBg(data.grade);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <p className="text-sm font-medium text-gray-500">Security score for</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{data.domain}</h1>
      </div>

      {/* Grade circle + score */}
      <div
        className="flex flex-col items-center justify-center rounded-2xl border py-12"
        style={{ background: bg, borderColor: color + "33" }}
      >
        <div
          className="flex h-28 w-28 items-center justify-center rounded-full border-4 text-5xl font-extrabold shadow-sm"
          style={{ borderColor: color, color, background: "white" }}
        >
          {data.grade}
        </div>
        <p className="mt-4 text-4xl font-bold" style={{ color }}>
          {data.score}
          <span className="text-lg font-normal text-gray-400">/100</span>
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Last scanned: {relativeDate(new Date(data.scannedAt))}
        </p>
      </div>

      {/* Top findings */}
      {data.findings.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700">Top findings</h2>
          </div>
          <ul className="divide-y">
            {data.findings.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm text-gray-800">{f.title}</span>
                <SeverityPill severity={f.severity} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-center">
          <p className="text-sm font-medium text-green-700">✅ No open issues found</p>
        </div>
      )}

      {/* Powered by badge */}
      <div className="rounded-xl border border-gray-100 bg-white px-4 py-4 text-center">
        <p className="text-xs text-gray-400">
          Continuously monitored by{" "}
          <Link href="https://scantient.com" className="font-semibold text-gray-700 hover:underline">
            Scantient
          </Link>
          {" "}· Security monitoring for any web app
        </p>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/signup"
          className="inline-block rounded-lg bg-black px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Monitor your own app →
        </Link>
      </div>
    </div>
  );
}

// ─── Not found state ──────────────────────────────────────────────────────────

function NotFoundCard({ domain }: { domain: string }) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 text-4xl">
        🔍
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {domain} isn&apos;t monitored yet
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          This domain isn&apos;t currently monitored by Scantient.
        </p>
      </div>
      <Link
        href={`/score?url=https://${domain}`}
        className="inline-block rounded-lg bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Scan it free →
      </Link>
      <p className="text-xs text-gray-400">
        Want permanent monitoring?{" "}
        <Link href="/signup" className="font-medium text-gray-700 underline">
          Get started
        </Link>
      </p>
      {/* Powered by */}
      <div className="rounded-xl border border-gray-100 bg-white px-4 py-4">
        <p className="text-xs text-gray-400">
          Powered by{" "}
          <Link href="https://scantient.com" className="font-semibold text-gray-700 hover:underline">
            Scantient
          </Link>
          {" "}· Security monitoring for any web app
        </p>
      </div>
    </div>
  );
}
