import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Scantient",
  description: "How Scantient collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-muted">Legal</p>
        <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-4 text-sm text-muted">Effective date: February 1, 2026 · Last updated: February 1, 2026</p>

        <div className="prose prose-gray mt-12 max-w-none text-sm leading-relaxed">

          <h2 className="mt-8 text-lg font-semibold text-heading">1. Who we are</h2>
          <p className="mt-3 text-body">
            Scantient Inc. (&ldquo;Scantient&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the Scantient security monitoring platform, accessible at scantient.com. This policy explains how we collect, use, and share information when you use our service.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-heading">2. Information we collect</h2>
          <div className="mt-3 space-y-3 text-body">
            <p><strong className="text-heading">Account information:</strong> When you create an account, we collect your name, email address, organization name, and password (stored as a one-way hash).</p>
            <p><strong className="text-heading">Application URLs:</strong> You provide URLs of applications you want us to monitor. We store these to perform scans and maintain your monitoring history.</p>
            <p><strong className="text-heading">Scan data:</strong> We store the results of security scans, including findings, scores, and remediation status. This data is scoped to your organization and not shared with other customers.</p>
            <p><strong className="text-heading">Usage data:</strong> We collect basic usage analytics (pages visited, features used, session duration) to improve the product. We do not sell this data.</p>
            <p><strong className="text-heading">Payment information:</strong> Billing is handled by Stripe. We do not store credit card numbers. We store subscription status and billing history.</p>
          </div>

          <h2 className="mt-8 text-lg font-semibold text-heading">3. How we use your information</h2>
          <div className="mt-3 space-y-2 text-body">
            <p>We use collected information to: provide and improve the Scantient service; send security alerts and notifications you have configured; respond to support requests; send product updates and account communications; fulfill legal obligations.</p>
            <p>We do not use your data to train AI models. We do not sell your data to third parties.</p>
          </div>

          <h2 className="mt-8 text-lg font-semibold text-heading">4. Data sharing</h2>
          <div className="mt-3 space-y-2 text-body">
            <p>We share data only with service providers necessary to operate Scantient: Neon (database hosting), Vercel (application hosting), Stripe (billing), Sentry (error monitoring), and Upstash (rate limiting). Each is bound by a data processing agreement.</p>
            <p>We may disclose information if required by law, court order, or to protect the rights and safety of Scantient, our customers, or the public.</p>
          </div>

          <h2 className="mt-8 text-lg font-semibold text-heading">5. Data retention</h2>
          <p className="mt-3 text-body">
            We retain your account data as long as your account is active. Scan history is retained for 12 months on the Pro plan and 24 months on Enterprise. After account deletion, we purge personal data within 30 days and anonymized scan data within 90 days.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-heading">6. Security</h2>
          <p className="mt-3 text-body">
            We encrypt data in transit (TLS 1.2+) and at rest. Access to production systems is restricted to authorized personnel. We conduct periodic security reviews of our own infrastructure.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-heading">7. Your rights</h2>
          <p className="mt-3 text-body">
            You may request access to, correction of, or deletion of your personal data at any time by emailing privacy@scantient.com. If you are in the European Economic Area, you have additional rights under GDPR including the right to data portability and to lodge a complaint with a supervisory authority.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-heading">8. Cookies</h2>
          <p className="mt-3 text-body">
            We use cookies for authentication and basic analytics. See our{" "}
            <Link href="/cookie-policy" className="text-heading underline hover:no-underline">Cookie Policy</Link> for details.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-heading">9. Changes to this policy</h2>
          <p className="mt-3 text-body">
            We may update this policy periodically. We will notify customers of material changes by email at least 14 days before they take effect.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-heading">10. Contact</h2>
          <p className="mt-3 text-body">
            Questions about this policy: <a href="mailto:privacy@scantient.com" className="text-heading underline hover:no-underline">privacy@scantient.com</a>. Scantient Inc., Chicago, Illinois.
          </p>
        </div>
      </article>

    </>
  );
}
