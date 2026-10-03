import type { MetadataRoute } from "next";
import { getCompanySitemapCount, getCompanySitemapEntries } from "@/lib/api";
import { SITE_URL } from "@/lib/format";

export const revalidate = 86400;

/** แบ่ง sitemap หน้าบริษัทเป็นไฟล์ละ 50,000 URL → /company/sitemap/0.xml, /company/sitemap/1.xml, ... */
export async function generateSitemaps() {
  const count = await getCompanySitemapCount();
  return Array.from({ length: count }, (_, id) => ({ id }));
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const chunk = Number(await props.id);
  const entries = await getCompanySitemapEntries(chunk);
  return entries.map((e) => ({
    url: `${SITE_URL}/company/${e.id}`,
    ...(e.updatedAt && { lastModified: e.updatedAt }),
    changeFrequency: "monthly",
    priority: 0.7,
  }));
}
