import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/format";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/search", "/account", "/admin", "/pay/", "/login", "/register", "/auth/", "/export/", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap_index.xml`,
    host: SITE_URL,
  };
}
