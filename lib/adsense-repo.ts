/** อ่านรายงาน AdSense ที่ sync ไว้ + จำนวนหน้าที่เข้าชมจากสถิติของเราเอง (หน้า /admin/ads) */
import "server-only";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";

export interface AdsenseSummary {
  earnings: number;
  pageViews: number;
  impressions: number;
  clicks: number;
  daily: Array<{ day: string; earnings: number; pageViews: number; clicks: number }>;
  units: Array<{ unit: string; earnings: number; impressions: number; clicks: number }>;
  /** หน้าที่เข้าชมตามสถิติของเว็บเรา (เทียบ RPM จริงต่อ 1,000 หน้า) */
  ourViews: number;
  /** หน้าที่เข้าชมแยกประเภทหน้า (ใช้ประเมินว่าหน้าไหนน่าวางโฆษณา) */
  ourByType: Array<{ type: string; views: number }>;
}

export async function getAdsenseSummary(from: string, to: string): Promise<AdsenseSummary> {
  const [daily, units, [ours], byType] = await Promise.all([
    dbQuery<RowDataPacket[]>(
      `SELECT DATE_FORMAT(report_date, '%Y-%m-%d') d, earnings, page_views, impressions, clicks FROM adsense_report
       WHERE ad_unit = '__total__' AND report_date BETWEEN ? AND ? ORDER BY report_date`,
      [from, to],
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT ad_unit, SUM(earnings) e, SUM(impressions) i, SUM(clicks) c FROM adsense_report
       WHERE ad_unit <> '__total__' AND report_date BETWEEN ? AND ? GROUP BY ad_unit ORDER BY e DESC`,
      [from, to],
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) n FROM page_view WHERE ts >= ? - INTERVAL 7 HOUR AND ts < ? + INTERVAL 1 DAY - INTERVAL 7 HOUR`,
      [from, to],
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT COALESCE(entity_type, 'อื่น ๆ') t, COUNT(*) n FROM page_view
       WHERE ts >= ? - INTERVAL 7 HOUR AND ts < ? + INTERVAL 1 DAY - INTERVAL 7 HOUR GROUP BY t ORDER BY n DESC`,
      [from, to],
    ),
  ]);
  const map = new Map(daily.map((r) => [String(r.d), r]));
  const days: AdsenseSummary["daily"] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const r = map.get(d);
    days.push({ day: d, earnings: Number(r?.earnings ?? 0), pageViews: Number(r?.page_views ?? 0), clicks: Number(r?.clicks ?? 0) });
  }
  const sum = (k: string) => daily.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  return {
    earnings: sum("earnings"),
    pageViews: sum("page_views"),
    impressions: sum("impressions"),
    clicks: sum("clicks"),
    daily: days,
    units: units.map((r) => ({ unit: String(r.ad_unit), earnings: Number(r.e), impressions: Number(r.i), clicks: Number(r.c) })),
    ourViews: Number(ours?.n ?? 0),
    ourByType: byType.map((r) => ({ type: String(r.t), views: Number(r.n) })),
  };
}
