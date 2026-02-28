import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";
import NewsletterForm from "@/components/newsletter-form";

export const metadata: Metadata = {
  title: "Blog — VibeSafe",
  description:
    "Security insights, compliance guides, and practical advice for IT leaders managing AI-generated applications.",
};

const posts = [
  {
    slug: "/vibe-coding-risks",
    category: "Security",
    title: "The Hidden Security Risks of Vibe-Coded Applications",
    excerpt:
      "AI coding tools let anyone ship a production app in an afternoon. Here's what IT needs to know about the security gaps that come with them.",
    date: "February 20, 2026",
    readTime: "8 min read",
    featured: true,
  },
  {
    slug: "/compliance",
    category: "Compliance",
    title: "Continuous Compliance Monitoring for AI-Generated Applications",
    excerpt:
      "SOC 2, ISO 27001, NIST CSF — your compliance obligations don't have a carve-out for AI-generated code. Here's how to maintain coverage.",
    date: "February 14, 2026",
    readTime: "6 min read",
    featured: false,
  },
  {
    slug: "/security-checklist",
    category: "Security",
    title: "The IT Director's Security Checklist for AI-Built Apps",
    excerpt:
      "A practical checklist for evaluating the security posture of every AI-generated application deployed in your organization.",
    date: "February 7, 2026",
    readTime: "5 min read",
    featured: false,
  },
];

const upcoming = [
  { title: "How to Build a Shadow AI App Inventory", category: "Operations" },
  { title: "CISO Briefing: Explaining AI App Risk to the Board", category: "Leadership" },
  { title: "Incident Response for Vibe-Coded Applications", category: "Security" },
];

export default function BlogPage() {
  const featured = posts[0]!;
  const rest = posts.slice(1);

  return (
    <div className="bg-white">
      <MarketingNav />

      <div className="mx-auto max-w-6xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">Blog</p>
        <h1 className="text-4xl font-bold tracking-tight">Security for the AI era</h1>
        <p className="mt-4 max-w-xl text-lg text-gray-500">
          Practical guides for IT Directors and CISOs navigating the new world of AI-generated software.
        </p>

        {/* Featured post */}
        <div className="mt-12">
          <Link
            href={featured.slug}
            className="group block overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 p-8 transition hover:border-gray-200 hover:bg-gray-100 sm:p-12"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              {featured.category} · Featured
            </span>
            <h2 className="mt-3 text-2xl font-bold leading-snug tracking-tight text-gray-900 group-hover:text-black sm:text-3xl">
              {featured.title}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-500">{featured.excerpt}</p>
            <div className="mt-6 flex items-center gap-4 text-sm text-gray-400">
              <span>{featured.date}</span>
              <span>·</span>
              <span>{featured.readTime}</span>
            </div>
          </Link>
        </div>

        {/* Rest of posts */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {rest.map((post) => (
            <Link
              key={post.slug}
              href={post.slug}
              className="group block rounded-2xl border border-gray-100 p-6 transition hover:border-gray-200 hover:bg-gray-50"
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                {post.category}
              </span>
              <h2 className="mt-2 text-lg font-semibold leading-snug text-gray-900 group-hover:text-black">
                {post.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{post.excerpt}</p>
              <div className="mt-4 flex items-center gap-3 text-xs text-gray-400">
                <span>{post.date}</span>
                <span>·</span>
                <span>{post.readTime}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Coming soon */}
        <div className="mt-16">
          <h2 className="text-lg font-semibold text-gray-900">Coming soon</h2>
          <div className="mt-4 space-y-3">
            {upcoming.map((item) => (
              <div
                key={item.title}
                className="flex items-center justify-between rounded-xl border border-dashed border-gray-200 px-5 py-4"
              >
                <div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                    {item.category}
                  </span>
                  <p className="mt-0.5 text-sm font-medium text-gray-500">{item.title}</p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-400">
                  Soon
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Newsletter CTA */}
        <div className="mt-20 rounded-2xl bg-gray-50 p-8 text-center">
          <h2 className="text-xl font-bold">Get new posts in your inbox</h2>
          <p className="mt-2 text-sm text-gray-500">
            Practical security and compliance insights for IT leaders. No fluff.
          </p>
          <div className="mt-6">
            <NewsletterForm />
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
