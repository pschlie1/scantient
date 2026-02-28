import Link from "next/link";

const footerColumns = [
  {
    header: "Product",
    links: [
      { label: "Overview", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Compliance", href: "/compliance" },
      { label: "API Docs", href: "/docs" },
    ],
  },
  {
    header: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Blog", href: "/blog" },
      { label: "Press", href: "/press" },
    ],
  },
  {
    header: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Free Security Score", href: "/score" },
      { label: "Security Checklist", href: "/security-checklist" },
      { label: "Vibe Coding Risks", href: "/vibe-coding-risks" },
      { label: "Help Center", href: "/help" },
    ],
  },
  {
    header: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Cookie Policy", href: "/cookie-policy" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-ink-black-950">
      {/* Top section */}
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid grid-cols-1 gap-12 py-20 sm:grid-cols-2 lg:grid-cols-5">
          {/* Col 1 — Brand (2/5 width on lg) */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
                <span className="text-sm font-bold text-ink-black-950">V</span>
              </div>
              <span className="text-xl font-bold text-white">VibeSafe</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-alabaster-grey-400">
              Complete visibility into your AI-built app portfolio.
            </p>
          </div>

          {/* Cols 2–5 — Link columns */}
          {footerColumns.map((col) => (
            <div key={col.header}>
              <h4 className="mb-6 text-xs font-bold uppercase tracking-widest text-white">
                {col.header}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-alabaster-grey-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-ink-black-800">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
            <p className="text-sm text-alabaster-grey-600">
              © 2026 VibeSafe Inc. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link href="/status" className="text-sm text-alabaster-grey-400 transition-colors hover:text-white">
                Status
              </Link>
              <Link href="/security-checklist" className="text-sm text-alabaster-grey-400 transition-colors hover:text-white">
                Security
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
