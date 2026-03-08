import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Scantient: AI App Security Monitoring for IT Directors",
  description:
    "Scantient scans every AI-generated app in your portfolio for security vulnerabilities, exposed API keys, and compliance gaps. No SDK required.",
  metadataBase: new URL("https://scantient.com"),
  alternates: {
    canonical: "https://scantient.com",
  },
  openGraph: {
    title: "Scantient: AI App Security Monitoring for IT Directors",
    description:
      "Scantient scans every AI-generated app in your portfolio for security vulnerabilities, exposed API keys, and compliance gaps. No SDK required.",
    url: "https://scantient.com",
    siteName: "Scantient",
    type: "website",
    images: [
      {
        url: "https://scantient.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Scantient – AI App Security Monitoring",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Scantient: AI App Security Monitoring for IT Directors",
    description:
      "Scantient scans every AI-generated app in your portfolio for security vulnerabilities, exposed API keys, and compliance gaps. No SDK required.",
    images: ["https://scantient.com/og-image.png"],
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Scantient",
  url: "https://scantient.com",
  logo: "https://scantient.com/logo.png",
  description: "AI-generated application security monitoring platform",
  foundingDate: "2025",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Chicago",
    addressRegion: "IL",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the per-request nonce forwarded by middleware via the x-nonce request header.
  // This allows the JSON-LD <script> to be trusted by the nonce-based CSP policy.
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;

  return (
    <html lang="en" className="bg-page">
      <head>
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
