import type { Metadata } from "next";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "Terms of Service — Scantient",
  description: "Scantient Terms of Service governing your use of the platform.",
};

export default function TermsPage() {
  return (
    <div className="bg-white">
      <MarketingNav />

      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">Legal</p>
        <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-4 text-sm text-gray-400">Effective date: February 1, 2026 · Last updated: February 1, 2026</p>

        <div className="mt-12 space-y-8 text-sm leading-relaxed text-gray-600">

          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Acceptance of terms</h2>
            <p className="mt-3">
              By accessing or using the Scantient platform (&ldquo;Service&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Description of service</h2>
            <p className="mt-3">
              Scantient provides security monitoring, scanning, and reporting services for web applications. The Service performs HTTP-based security assessments of URLs you provide and delivers findings, scores, and alerts through a web dashboard and API.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Permitted use</h2>
            <div className="mt-3 space-y-2">
              <p>You may use Scantient only to scan applications that you own, control, or have explicit written permission from the owner to scan. You represent and warrant that you have such permission for every URL you submit to the Service.</p>
              <p>You may not use Scantient to scan applications without authorization, to perform denial-of-service attacks, to gather competitive intelligence on third parties, or for any illegal purpose.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Accounts and access</h2>
            <p className="mt-3">
              You are responsible for maintaining the confidentiality of your account credentials and API keys. You must notify us immediately at security@scantient.com if you believe your account has been compromised. We are not liable for losses arising from unauthorized access to your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Subscriptions and billing</h2>
            <div className="mt-3 space-y-2">
              <p>Paid plans are billed monthly or annually in advance. All fees are non-refundable except as required by law or as specified in our refund policy. We reserve the right to change pricing with 30 days&apos; notice.</p>
              <p>If you exceed plan limits (number of apps, scan frequency), we may prompt you to upgrade or throttle your usage at our discretion.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Service availability</h2>
            <p className="mt-3">
              We target 99.9% uptime for the Scantient dashboard and scanning infrastructure. Planned maintenance will be communicated at least 48 hours in advance via status.scantient.com and email. We are not liable for downtime caused by third-party infrastructure providers or events outside our control.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Data and privacy</h2>
            <p className="mt-3">
              Your use of the Service is subject to our <a href="/privacy" className="text-black underline hover:no-underline">Privacy Policy</a>. Scan results and account data are yours. We do not sell your data or use it to train AI models.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Intellectual property</h2>
            <p className="mt-3">
              Scantient retains all rights to the Service, including the scanning engine, UI, and underlying technology. You retain all rights to your data. You grant Scantient a limited license to process your data solely to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">9. Disclaimer of warranties</h2>
            <p className="mt-3">
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTIES OF ANY KIND. SCANTIENT DOES NOT WARRANT THAT SCANS WILL DETECT ALL SECURITY VULNERABILITIES OR THAT FOLLOWING REMEDIATION GUIDANCE WILL PREVENT SECURITY INCIDENTS. SECURITY SCANNING IS ONE LAYER OF DEFENSE, NOT A GUARANTEE OF SECURITY.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">10. Limitation of liability</h2>
            <p className="mt-3">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SCANTIENT&apos;S TOTAL LIABILITY FOR ANY CLAIM ARISING FROM THESE TERMS OR YOUR USE OF THE SERVICE WILL NOT EXCEED THE FEES PAID BY YOU IN THE 12 MONTHS PRECEDING THE CLAIM. IN NO EVENT WILL SCANTIENT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">11. Termination</h2>
            <p className="mt-3">
              Either party may terminate at any time. You may cancel your subscription in Settings → Billing. We may suspend or terminate accounts that violate these Terms, with or without notice for material violations. Upon termination, we will retain your data for 30 days to allow export, then permanently delete it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">12. Governing law</h2>
            <p className="mt-3">
              These Terms are governed by the laws of the State of Illinois, United States. Disputes will be resolved in the courts of Cook County, Illinois, and both parties consent to that jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">13. Contact</h2>
            <p className="mt-3">
              Questions about these Terms: <a href="mailto:legal@scantient.com" className="text-black underline hover:no-underline">legal@scantient.com</a>. Scantient Inc., Chicago, Illinois.
            </p>
          </section>
        </div>
      </article>

      <Footer />
    </div>
  );
}
