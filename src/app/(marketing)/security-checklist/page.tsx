import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "AI App Security Checklist: 15 Things to Check Before Going Live | Scantient",
  description:
    "A comprehensive security checklist for AI-generated applications. 15 critical checks every IT leader should verify before deploying vibe-coded apps to production.",
};

const items = [
  {
    num: 1,
    title: "Scan for Exposed API Keys in Client-Side Code",
    body: "AI code generators frequently embed API keys directly in frontend JavaScript. Check for OpenAI, Stripe, Supabase, Firebase, and AWS keys in your page source and bundled scripts. A single exposed key can cost thousands in unauthorized API usage within hours.",
  },
  {
    num: 2,
    title: "Verify Security Headers Are Present",
    body: "Ensure Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), X-Frame-Options, X-Content-Type-Options, and Permissions-Policy headers are configured. AI tools rarely add these automatically, leaving apps vulnerable to XSS, clickjacking, and protocol downgrade attacks.",
  },
  {
    num: 3,
    title: "Check Authentication Isn't Client-Side Only",
    body: "A common pattern in AI-generated apps: auth checks happen in the browser but not on the server. Look for localStorage-based auth gates, client-side role checks, and API routes without middleware protection. If removing a JavaScript check grants access, authentication is broken.",
  },
  {
    num: 4,
    title: "Audit Database Access Rules",
    body: "If your app uses Supabase or Firebase, verify Row Level Security (RLS) policies are enabled and correctly configured. AI generators often disable RLS for simplicity, exposing entire databases to any authenticated — or unauthenticated — user.",
  },
  {
    num: 5,
    title: "Remove Source Maps from Production",
    body: "Source maps expose your entire application source code to anyone who opens DevTools. Check for .map files being served in production. Most AI-generated build configurations leave source maps enabled by default.",
  },
  {
    num: 6,
    title: "Validate Input on the Server",
    body: "AI tools love client-side validation — pretty form errors, inline checks, character limits. But without server-side validation, attackers bypass everything with a single curl command. Every API endpoint must validate and sanitize inputs independently.",
  },
  {
    num: 7,
    title: "Review CORS Configuration",
    body: "Check that your API doesn't return Access-Control-Allow-Origin: *. AI code generators often set permissive CORS to avoid development friction, but this allows any website to make authenticated requests to your API on behalf of your users.",
  },
  {
    num: 8,
    title: "Check for Hardcoded Secrets in Environment Variables",
    body: "Verify that .env files aren't committed to version control and that NEXT_PUBLIC_ or VITE_ prefixed variables don't contain sensitive values. AI assistants frequently suggest putting secrets in public environment variables without understanding the exposure.",
  },
  {
    num: 9,
    title: "Test Rate Limiting on Critical Endpoints",
    body: "Login, signup, password reset, and payment endpoints must have rate limiting. Without it, attackers can brute-force credentials, create spam accounts, or abuse expensive API calls. Most AI-generated apps have zero rate limiting.",
  },
  {
    num: 10,
    title: "Verify HTTPS Is Enforced Everywhere",
    body: "Ensure all traffic is redirected to HTTPS and that HSTS headers are set. Check that no mixed content warnings appear. AI tools sometimes hardcode HTTP URLs for API calls or asset loading, creating security gaps even on HTTPS-enabled hosts.",
  },
  {
    num: 11,
    title: "Audit Third-Party Dependencies",
    body: "Run npm audit or equivalent and review the results. AI code generators install packages without evaluating security posture. Look for deprecated packages, known vulnerabilities, and unnecessary dependencies that expand your attack surface.",
  },
  {
    num: 12,
    title: "Check for Sensitive Data in Error Messages",
    body: "Trigger errors intentionally and review what's returned. Stack traces, database connection strings, internal file paths, and SQL queries should never reach the client. AI-generated error handling often exposes debugging information in production.",
  },
  {
    num: 13,
    title: "Review File Upload Handling",
    body: "If the app accepts file uploads, verify file type validation happens server-side, files are scanned for malware, and uploaded files can't be executed. AI implementations often trust client-side file type checks and store uploads in publicly accessible directories.",
  },
  {
    num: 14,
    title: "Test Authorization Between Users",
    body: "Log in as User A, capture an API request, then replay it with User B's session. Can User B access User A's data? Broken object-level authorization (BOLA) is the #1 API vulnerability and almost universal in AI-generated multi-tenant apps.",
  },
  {
    num: 15,
    title: "Set Up Continuous Monitoring",
    body: "Security isn't a one-time check. AI-generated apps change frequently — every prompt-driven update can introduce new vulnerabilities. Set up continuous external monitoring to catch regressions before attackers do. Tools like Scantient automate this entire checklist on a recurring schedule.",
  },
];

export default function SecurityChecklistPage() {
  return (
    <div className="bg-white">
      <MarketingNav />

      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">Security Guide</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          AI App Security Checklist: 15 Things to Check Before Going Live
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-gray-500">
          AI code generators build fast — but they don&apos;t build secure. Whether your team is using Cursor, Lovable, Bolt, or Replit, these 15 checks will catch the most common and most dangerous vulnerabilities before they reach production.
        </p>

        <div className="mt-16 space-y-12">
          {items.map((item) => (
            <div key={item.num}>
              <h2 className="text-xl font-semibold">
                <span className="mr-2 text-gray-300">{item.num}.</span>
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 rounded-2xl bg-gray-50 p-8 text-center">
          <h2 className="text-2xl font-bold">Automate this entire checklist</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-gray-500">
            Scantient runs these checks continuously on every AI-generated app in your organization. No SDK required. Start your free trial and scan your first app in under 2 minutes.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-black px-8 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Start 14-day free trial
          </Link>
        </div>

        <div className="mt-12 flex gap-4 text-sm">
          <Link href="/vibe-coding-risks" className="text-gray-500 hover:text-black transition-colors">← The Hidden Risks of Vibe Coding</Link>
          <span className="text-gray-300">|</span>
          <Link href="/compliance" className="text-gray-500 hover:text-black transition-colors">Compliance Monitoring →</Link>
        </div>
      </article>

      <Footer />
    </div>
  );
}
