import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/format";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // crawler ของ AdSense ต้องเข้าถึงหน้าที่แสดงโฆษณาได้ เพื่อเลือกโฆษณาให้ตรงเนื้อหา
      { userAgent: "Mediapartners-Google", allow: "/" },
      { userAgent: "*", allow: "/", disallow: ["/search", "/account", "/admin", "/pay/", "/login", "/register", "/auth/", "/export/", "/api/", "/business/"] },
    ],
    sitemap: `${SITE_URL}/sitemap_index.xml`,
    host: SITE_URL,
  };
}
