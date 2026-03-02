import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Do not list /api/ — it reveals API surface to attackers.
        // Routes below are auth-protected server-side; robots.txt is not a security control.
        disallow: ["/dashboard", "/settings", "/onboarding", "/invite"],
      },
    ],
    sitemap: "https://scantient.com/sitemap.xml",
  };
}
