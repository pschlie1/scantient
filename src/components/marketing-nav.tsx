import Link from "next/link";

export default function MarketingNav() {
  return (
    <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
      <Link href="/" className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
          <span className="text-sm font-bold text-white">V</span>
        </div>
        <span className="font-bold">Scantient</span>
      </Link>
      <div className="flex items-center gap-6">
        <Link href="/blog" className="hidden text-sm text-gray-500 hover:text-black transition-colors sm:block">Blog</Link>
        <Link href="/docs" className="hidden text-sm text-gray-500 hover:text-black transition-colors sm:block">Docs</Link>
        <Link href="/score" className="hidden text-sm font-medium text-gray-700 hover:text-black transition-colors sm:block">Free Score</Link>
        <Link href="/login" className="text-sm text-gray-500 hover:text-black transition-colors">Sign in</Link>
        <Link href="/signup" className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors">
          Start free trial
        </Link>
      </div>
    </nav>
  );
}
