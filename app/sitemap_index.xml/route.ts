import { getCompanySitemapCount } from "@/lib/api";
import { SITE_URL } from "@/lib/format";

export const revalidate = 86400;

/** Sitemap index — Next.js ไม่สร้างให้อัตโนมัติเมื่อใช้ generateSitemaps */
export async function GET() {
  const count = await getCompanySitemapCount();
  const urls = [`${SITE_URL}/sitemap.xml`, ...Array.from({ length: count }, (_, i) => `${SITE_URL}/company/sitemap/${i}.xml`)];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <sitemap><loc>${u}</loc></sitemap>`).join("\n") +
    `\n</sitemapindex>\n`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
