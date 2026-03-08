import Link from "next/link";

export default function MarketingNav() {
  return (
    <nav
      className="sticky top-0 z-50 border-b border-border-subtle"
      style={{
        background: "rgba(13,27,42,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface">
            <span className="text-sm font-bold text-heading">V</span>
          </div>
          <span className="font-bold tracking-tight text-heading">
            Scantient
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/blog"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-heading sm:block"
          >
            Blog
          </Link>
          <Link
            href="/docs"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-heading sm:block"
          >
            Docs
          </Link>
          <Link
            href="/security-checklist"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-heading sm:block"
          >
            Resources
          </Link>
          <Link
            href="/pricing"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-heading sm:block"
          >
            Pricing
          </Link>
          <Link
            href="/score"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-heading sm:block"
          >
            Free Score
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-muted transition-colors hover:text-heading"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-heading transition-colors hover:bg-primary-hover"
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}
