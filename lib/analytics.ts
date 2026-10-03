/**
 * สถิติผู้เข้าชมแบบ first-party (ไม่ใช้คุกกี้ ไม่ส่งข้อมูลให้บุคคลภายนอก)
 * - visitor = SHA-256(เกลือรายวัน + IP + User-Agent) ตัด 16 ตัว → นับผู้เข้าชมไม่ซ้ำรายวันได้ แต่ย้อนกลับเป็น IP ไม่ได้
 *   และเปลี่ยนทุกวัน (ติดตามคนข้ามวันไม่ได้) — แนวทางเดียวกับ Plausible / Fathom
 * - ts เก็บเป็น UTC · จัดกลุ่มรายวัน/ชั่วโมงตามเวลาไทย (+7)
 */
import "server-only";
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";

const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|vkshare|whatsapp|telegram|lighthouse|headless|phantom|puppeteer|playwright|python|curl|wget|httpclient|java\/|go-http|axios|node-fetch|monitor|uptime|preview/i;

export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua);
}

export function parseUa(ua: string): { device: string; browser: string; os: string } {
  const device = /ipad|tablet|(android(?!.*mobile))/i.test(ua) ? "tablet" : /mobi|iphone|android/i.test(ua) ? "mobile" : "desktop";
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /opr\/|opera/i.test(ua)
      ? "Opera"
      : /samsungbrowser/i.test(ua)
        ? "Samsung"
        : /line\//i.test(ua)
          ? "LINE"
          : /fban|fbav|fb_iab/i.test(ua)
            ? "Facebook"
            : /chrome|crios/i.test(ua)
              ? "Chrome"
              : /firefox|fxios/i.test(ua)
                ? "Firefox"
                : /safari/i.test(ua)
                  ? "Safari"
                  : "อื่น ๆ";
  const os = /windows/i.test(ua)
    ? "Windows"
    : /iphone|ipad|ipod/i.test(ua)
      ? "iOS"
      : /android/i.test(ua)
        ? "Android"
        : /mac os/i.test(ua)
          ? "macOS"
          : /linux/i.test(ua)
            ? "Linux"
            : "อื่น ๆ";
  return { device, browser, os };
}

/** ประเภทหน้า + รหัส (บริษัท/หน่วยงาน/TSIC/...) จาก path */
export function classify(pathname: string, search: URLSearchParams): { type: string | null; id: string | null; query: string | null } {
  let m: RegExpMatchArray | null;
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  if ((m = pathname.match(/^\/company\/(\d{13})/))) return { type: "company", id: m[1], query: null };
  if ((m = pathname.match(/^\/agency\/([^/]+)$/)) && m[1] !== "search") return { type: "agency", id: dec(m[1]).slice(0, 255), query: null };
  if ((m = pathname.match(/^\/tsic\/(\d{5})/))) return { type: "tsic", id: m[1], query: null };
  if ((m = pathname.match(/^\/new\/(\d{4}-\d{2})/))) return { type: "new", id: m[1], query: null };
  if ((m = pathname.match(/^\/procurement\/([^/]+)$/)) && !["contracts", "winners"].includes(m[1])) {
    return { type: "procurement", id: dec(m[1]).slice(0, 255), query: null };
  }
  if (pathname === "/search") {
    const q = search.get("q")?.trim().slice(0, 255) || null;
    return { type: "search", id: null, query: q };
  }
  return { type: null, id: null, query: null };
}

export function visitorHash(ip: string, ua: string): string {
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const salt = process.env.ANALYTICS_SALT ?? process.env.DB_PASSWORD ?? "tdc";
  return createHash("sha256").update(`${salt}|${day}|${ip}|${ua}`).digest("hex").slice(0, 16);
}

export async function recordView(v: {
  path: string;
  type: string | null;
  id: string | null;
  query: string | null;
  visitor: string;
  referrer: string | null;
  device: string;
  browser: string;
  os: string;
  member: boolean;
}): Promise<void> {
  await dbQuery(
    `INSERT INTO page_view (ts, path, entity_type, entity_id, query, visitor, referrer, device, browser, os, member)
     VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [v.path, v.type, v.id, v.query, v.visitor, v.referrer, v.device, v.browser, v.os, v.member ? 1 : 0],
  );
}

/* ------------------------------------------------------------- อ่านสถิติ */

const TH_DAY = "DATE(ts + INTERVAL 7 HOUR)";

/** ยอดเข้าชมรายวันของหน้าใดหน้าหนึ่ง (เช่น บริษัท) ย้อนหลัง N วัน — เติมวันที่ไม่มีคนดูเป็น 0 */
export async function getEntityDaily(type: string, id: string, days = 30): Promise<Array<{ day: string; views: number }>> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT ${TH_DAY} d, COUNT(*) n FROM page_view
     WHERE entity_type = ? AND entity_id = ? AND ts >= UTC_TIMESTAMP() - INTERVAL ? DAY GROUP BY d`,
    [type, id, days],
  );
  const map = new Map(rows.map((r) => [String(r.d).slice(0, 10), Number(r.n)]));
  return fillDays(days).map((day) => ({ day, views: map.get(day) ?? 0 }));
}

/** รายการวันที่ (เวลาไทย) ย้อนหลัง N วันถึงวันนี้ */
export function fillDays(days: number, end?: string): string[] {
  const last = end ? new Date(`${end}T00:00:00Z`) : new Date(Date.now() + 7 * 3600_000);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(last.getTime() - i * 86400_000).toISOString().slice(0, 10));
  return out;
}

export interface AnalyticsFilter {
  /** YYYY-MM-DD เวลาไทย */
  from: string;
  to: string;
  /** เจาะจง: ประเภท + รหัส หรือ path ขึ้นต้นด้วย */
  type?: string;
  id?: string;
  path?: string;
}

function where(f: AnalyticsFilter): { sql: string; params: unknown[] } {
  // ช่วงวันที่แบบเวลาไทย → แปลงเป็น UTC เพื่อใช้ index ts
  const w = ["ts >= ? - INTERVAL 7 HOUR", "ts < ? + INTERVAL 1 DAY - INTERVAL 7 HOUR"];
  const p: unknown[] = [f.from, f.to];
  if (f.type) (w.push("entity_type = ?"), p.push(f.type));
  if (f.id) (w.push("entity_id = ?"), p.push(f.id));
  if (f.path) (w.push("path LIKE ?"), p.push(`${f.path.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
  return { sql: w.join(" AND "), params: p };
}

export async function getOverview(f: AnalyticsFilter) {
  const { sql, params } = where(f);
  const q = <T extends RowDataPacket[]>(s: string, extra: unknown[] = []) => dbQuery<T>(s, [...params, ...extra]);
  const [totals, daily, hourly, pages, companies, agencies, tsic, searches, referrers, devices, browsers, oses] = await Promise.all([
    q(`SELECT COUNT(*) views, COUNT(DISTINCT visitor) visitors, SUM(member) member_views,
         COUNT(DISTINCT CASE WHEN member = 1 THEN visitor END) member_visitors FROM page_view WHERE ${sql}`),
    q(`SELECT ${TH_DAY} d, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM page_view WHERE ${sql} GROUP BY d ORDER BY d`),
    q(`SELECT HOUR(ts + INTERVAL 7 HOUR) h, COUNT(*) n FROM page_view WHERE ${sql} GROUP BY h`),
    q(`SELECT path, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM page_view WHERE ${sql} GROUP BY path ORDER BY views DESC LIMIT 30`),
    q(`SELECT v.entity_id id, j.name_th name, COUNT(*) views, COUNT(DISTINCT v.visitor) visitors FROM page_view v
       LEFT JOIN juristic j ON j.id = v.entity_id WHERE ${sql.replace(/\b(ts|entity_type|entity_id|path)\b/g, "v.$1")} AND v.entity_type = 'company'
       GROUP BY v.entity_id, j.name_th ORDER BY views DESC LIMIT 20`),
    q(`SELECT entity_id id, COUNT(*) views FROM page_view WHERE ${sql} AND entity_type = 'agency' GROUP BY entity_id ORDER BY views DESC LIMIT 15`),
    q(`SELECT v.entity_id id, t.name_th name, COUNT(*) views FROM page_view v LEFT JOIN tsic t ON t.code = v.entity_id
       WHERE ${sql.replace(/\b(ts|entity_type|entity_id|path)\b/g, "v.$1")} AND v.entity_type = 'tsic' GROUP BY v.entity_id, t.name_th ORDER BY views DESC LIMIT 15`),
    q(`SELECT query, COUNT(*) n FROM page_view WHERE ${sql} AND query IS NOT NULL GROUP BY query ORDER BY n DESC LIMIT 20`),
    q(`SELECT COALESCE(referrer, '(เข้าตรง / ภายในเว็บ)') ref, COUNT(*) n, COUNT(DISTINCT visitor) visitors FROM page_view WHERE ${sql}
       GROUP BY ref ORDER BY n DESC LIMIT 15`),
    q(`SELECT device k, COUNT(*) n FROM page_view WHERE ${sql} GROUP BY device ORDER BY n DESC`),
    q(`SELECT browser k, COUNT(*) n FROM page_view WHERE ${sql} GROUP BY browser ORDER BY n DESC`),
    q(`SELECT os k, COUNT(*) n FROM page_view WHERE ${sql} GROUP BY os ORDER BY n DESC`),
  ]);
  const t = totals[0] ?? {};
  const dailyMap = new Map(daily.map((r) => [String(r.d).slice(0, 10), { views: Number(r.views), visitors: Number(r.visitors) }]));
  const span = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86400_000) + 1;
  const hours = new Map(hourly.map((r) => [Number(r.h), Number(r.n)]));
  const kv = (rows: RowDataPacket[]) => rows.map((r) => ({ key: String(r.k ?? "-"), n: Number(r.n) }));
  return {
    views: Number(t.views ?? 0),
    visitors: Number(t.visitors ?? 0),
    memberViews: Number(t.member_views ?? 0),
    memberVisitors: Number(t.member_visitors ?? 0),
    daily: fillDays(span, f.to).map((day) => ({ day, ...(dailyMap.get(day) ?? { views: 0, visitors: 0 }) })),
    hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, n: hours.get(h) ?? 0 })),
    pages: pages.map((r) => ({ path: String(r.path), views: Number(r.views), visitors: Number(r.visitors) })),
    companies: companies.map((r) => ({ id: String(r.id), name: r.name ? String(r.name) : null, views: Number(r.views), visitors: Number(r.visitors) })),
    agencies: agencies.map((r) => ({ id: String(r.id), views: Number(r.views) })),
    tsic: tsic.map((r) => ({ id: String(r.id), name: r.name ? String(r.name).trim() : null, views: Number(r.views) })),
    searches: searches.map((r) => ({ query: String(r.query), n: Number(r.n) })),
    referrers: referrers.map((r) => ({ ref: String(r.ref), n: Number(r.n), visitors: Number(r.visitors) })),
    devices: kv(devices),
    browsers: kv(browsers),
    oses: kv(oses),
  };
}

/** ผู้ใช้งานตอนนี้ (30 นาทีล่าสุด) */
export async function getRealtime() {
  const [tot, pages] = await Promise.all([
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT visitor) visitors, COUNT(*) views FROM page_view WHERE ts >= UTC_TIMESTAMP() - INTERVAL 30 MINUTE`,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT path, COUNT(*) n FROM page_view WHERE ts >= UTC_TIMESTAMP() - INTERVAL 30 MINUTE GROUP BY path ORDER BY n DESC LIMIT 10`,
    ),
  ]);
  return {
    visitors: Number(tot[0]?.visitors ?? 0),
    views: Number(tot[0]?.views ?? 0),
    pages: pages.map((r) => ({ path: String(r.path), n: Number(r.n) })),
  };
}

/** ลบข้อมูลดิบเก่ากว่า N วัน (เรียกจากงานตามกำหนดเวลา) */
export async function purgeOldViews(keepDays = 400): Promise<number> {
  const r = await dbQuery<import("mysql2").ResultSetHeader>(`DELETE FROM page_view WHERE ts < UTC_TIMESTAMP() - INTERVAL ? DAY LIMIT 100000`, [
    keepDays,
  ]);
  return r.affectedRows;
}
