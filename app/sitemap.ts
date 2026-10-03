import type { MetadataRoute } from "next";
import { getProvider } from "@/lib/api";
import { SITE_URL } from "@/lib/format";
import { agencyUrl, procurementUrl } from "@/lib/format";
import { listAgencySitemapNames, listProcurementProvinces } from "@/lib/procurement-repo";
import { listNewSitemapPaths } from "@/lib/new-repo";
import { listTsicSitemapPaths } from "@/lib/tsic-repo";
import { listLiveJobIds, listPublishedNewsIds } from "@/lib/business";
import { listReportMonths } from "@/lib/report-repo";

export const revalidate = 86400;

/**
 * sitemap ของหน้าหลัก + หน้าประเภทธุรกิจ (/tsic/*) — หน้าบริษัทแยกไปอยู่ที่ /company/sitemap/[n].xml
 * และรวมทั้งหมดไว้ใน /sitemap_index.xml (ส่งไฟล์นี้ให้ Google Search Console)
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const home: MetadataRoute.Sitemap = [{ url: SITE_URL, changeFrequency: "daily", priority: 1 }];
  if (getProvider() !== "db") return home;

  const safe = <T,>(p: Promise<T[]>) =>
    p.catch((e) => {
      console.error("[sitemap] failed:", e);
      return [] as T[];
    });
  const [tsicPaths, agencies, provinces, newPaths, jobs, news, reports] = await Promise.all([
    safe(listTsicSitemapPaths()),
    safe(listAgencySitemapNames()),
    safe(listProcurementProvinces()),
    safe(listNewSitemapPaths()),
    safe(listLiveJobIds()),
    safe(listPublishedNewsIds()),
    safe(listReportMonths()),
  ]);
  const paths = [
    ...newPaths,
    ...tsicPaths,
    "/procurement",
    "/agency",
    "/pricing",
    "/terms",
    "/contact",
    "/changes",
    "/report",
    ...reports.map((m) => `/report/${m.ym}`),
    "/jobs",
    "/news",
    "/business",
    "/data-deletion",
    ...provinces.map((p) => procurementUrl(p.province)),
    ...agencies.map(agencyUrl),
    ...jobs.map((j) => `/jobs/${j.id}`),
    ...news.map((n) => `/news/${n.id}`),
  ];
  return [
    ...home,
    ...paths.map((p) => ({
      url: `${SITE_URL}${p}`,
      changeFrequency: "weekly" as const,
      priority: ["/new", "/changes", "/report", "/tsic", "/procurement", "/agency"].includes(p) ? 0.9 : p.split("/").length === 3 ? 0.7 : 0.6,
    })),
  ];
}
