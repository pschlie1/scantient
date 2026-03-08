import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy — Scantient",
  description: "How Scantient uses cookies and similar technologies.",
};

const cookies = [
  {
    name: "vs_session",
    type: "Essential",
    purpose: "Authenticates your session after login. Required for the Service to function.",
    duration: "7 days (or until logout)",
  },
  {
    name: "vs_csrf",
    type: "Essential",
    purpose: "Prevents cross-site request forgery attacks on form submissions.",
    duration: "Session",
  },
  {
    name: "_vercel_jwt",
    type: "Essential",
    purpose: "Used by our hosting provider (Vercel) for routing and preview access control.",
    duration: "Session",
  },
  {
    name: "_ga, _ga_*",
    type: "Analytics",
    purpose: "Google Analytics: tracks aggregate usage patterns to help us improve the product. Does not collect personal data.",
    duration: "2 years",
  },
];

export default function CookiePolicyPage() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-muted">Legal</p>
        <h1 className="text-4xl font-bold tracking-tight">Cookie Policy</h1>
        <p className="mt-4 text-sm text-muted">Effective date: February 1, 2026</p>

        <div className="mt-12 space-y-8 text-sm leading-relaxed text-body">
          <section>
            <h2 className="text-lg font-semibold text-heading">What are cookies?</h2>
            <p className="mt-3">
              Cookies are small text files stored in your browser when you visit a website. They allow the site to recognize your browser on subsequent visits and enable features like staying logged in.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-heading">How we use cookies</h2>
            <p className="mt-3">Scantient uses a small number of cookies, all listed below. We do not use cookies for advertising or cross-site tracking.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-heading">Cookies we set</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              {cookies.map((cookie, i) => (
                <div key={cookie.name} className={`p-5 ${i > 0 ? "border-t border-border" : ""}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <code className="rounded bg-surface-raised px-2 py-0.5 text-xs font-mono text-heading">{cookie.name}</code>
                      <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-xs text-muted">{cookie.type}</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{cookie.duration}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{cookie.purpose}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-heading">Essential vs. analytics cookies</h2>
            <p className="mt-3">
              Essential cookies are required for Scantient to function and cannot be disabled. Analytics cookies help us understand how the product is used so we can improve it. You can disable analytics cookies by using browser settings or a privacy tool like uBlock Origin; the Service will continue to work normally.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-heading">Third-party cookies</h2>
            <p className="mt-3">
              Our payment processor (Stripe) may set cookies during the checkout flow. These are governed by Stripe&apos;s privacy policy. No advertising networks set cookies through Scantient.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-heading">Managing cookies</h2>
            <p className="mt-3">
              You can manage or delete cookies through your browser settings. Note that deleting essential cookies will log you out of the Service. For more information on managing cookies, visit{" "}
              <a href="https://www.allaboutcookies.org" target="_blank" rel="noopener noreferrer" className="text-heading underline hover:no-underline">
                allaboutcookies.org
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-heading">Contact</h2>
            <p className="mt-3">
              Questions about our use of cookies: <a href="mailto:privacy@scantient.com" className="text-heading underline hover:no-underline">privacy@scantient.com</a>.
            </p>
          </section>
        </div>
      </article>

    </>
  );
}
