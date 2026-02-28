import Link from "next/link";

const footerLinks = {
  Product: [
    { label: "Features", href: "/#features" },
    { label: "Pricing", href: "/#pricing" },
    { label: "Security Checklist", href: "/security-checklist" },
    { label: "Start Free Trial", href: "/signup" },
  ],
  Resources: [
    { label: "Vibe Coding Risks", href: "/vibe-coding-risks" },
    { label: "Compliance Monitoring", href: "/compliance" },
    { label: "Documentation", href: "#" },
    { label: "Blog", href: "#" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Contact", href: "#" },
    { label: "Careers", href: "#" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
    { label: "Security", href: "#" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-ink-black-900 bg-ink-black-950">
      <div className="mx-auto max-w-[1200px] px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
                <span className="text-sm font-bold text-ink-black-950">V</span>
              </div>
              <span className="font-bold text-white">VibeSafe</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-alabaster-grey-200">
              Continuous security monitoring for AI-generated applications. No SDK required.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-alabaster-grey-100">{category}</h4>
              <ul className="mt-4 space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-alabaster-grey-200 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-ink-black-900 pt-8 sm:flex-row">
          <p className="text-xs text-dusty-denim-500">© 2026 VibeSafe. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="#" className="text-xs text-dusty-denim-500 hover:text-white">Twitter</Link>
            <Link href="#" className="text-xs text-dusty-denim-500 hover:text-white">LinkedIn</Link>
            <Link href="#" className="text-xs text-dusty-denim-500 hover:text-white">GitHub</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
