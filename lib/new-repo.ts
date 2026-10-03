/**
 * บริษัทเปิดใหม่รายเดือน — /new, /new/[ym], /new/[ym]/[province]
 *
 * เดือนในระบบใช้ปี พ.ศ. แบบ "2569-01" (ตรงกับที่คนไทยค้นหา) แต่ query ด้วยวันที่ ค.ศ.
 * แสดงเฉพาะตั้งแต่ ม.ค. 2565 ซึ่งเป็นช่วงที่ชุดข้อมูล "นิติบุคคลจดทะเบียนตั้งใหม่" ครบทุกเดือน
 * (บริษัทเก่าที่ดึงจาก DBD Open API ทีละรายไม่นับ เพราะจะทำให้ตัวเลขเดือนเก่าดูน้อยผิดจริง)
 */
import "server-only";
import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { listJuristicWhere } from "@/lib/company-repo";
import type { JuristicProfile } from "@/types/company";

export const NEW_SINCE_CE = "2022-01-01";
export const PAGE_SIZE = 100;

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export interface MonthKey {
  /** "2569-01" */
  ym: string;
  yearBE: number;
  month: number;
  /** ช่วงวันที่ ค.ศ. [start, end) */
  start: string;
  end: string;
  label: string;
}

/** "2569-01" → ช่วงวันที่ ค.ศ. + ชื่อเดือนภาษาไทย (null ถ้ารูปแบบผิด/นอกช่วงข้อมูล) */
export function parseMonth(ym: string): MonthKey | null {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const yearBE = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || yearBE < 2565 || yearBE > 2700) return null;
  const y = yearBE - 543;
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = month === 12 ? `${y + 1}-01-01` : `${y}-${pad(month + 1)}-01`;
  return { ym, yearBE, month, start: `${y}-${pad(month)}-01`, end: next, label: `${THAI_MONTHS[month - 1]} ${yearBE}` };
}

/** เดือนก่อน/ถัดไป (คำนวณตรง ไม่ต้อง query) — ถัดไปไม่เกินเดือนปัจจุบัน, ก่อนหน้าไม่ก่อน ม.ค. 2565 */
export function adjacentMonths(ym: string): { newer: MonthKey | null; older: MonthKey | null } {
  const m = parseMonth(ym);
  if (!m) return { newer: null, older: null };
  const shift = (d: number) => {
    const idx = m.yearBE * 12 + (m.month - 1) + d;
    return parseMonth(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  };
  const now = new Date();
  const currentIdx = (now.getFullYear() + 543) * 12 + now.getMonth();
  const newer = shift(1);
  return {
    newer: newer && newer.yearBE * 12 + newer.month - 1 <= currentIdx ? newer : null,
    older: shift(-1),
  };
}

/** "2026-01" (ค.ศ. จาก DB) → "2569-01" */
function toBEKey(ceYm: string): string {
  const [y, m] = ceYm.split("-");
  return `${Number(y) + 543}-${m}`;
}

/** เดือนที่มีข้อมูล (ล่าสุดก่อน) พร้อมจำนวน */
export const listNewMonths = cache(async (): Promise<Array<MonthKey & { count: number }>> => {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT DATE_FORMAT(register_date, '%Y-%m') ym, COUNT(*) n FROM juristic
     WHERE register_date >= ? AND register_date <= CURDATE() GROUP BY ym ORDER BY ym DESC`,
    [NEW_SINCE_CE],
  );
  return rows.flatMap((r) => {
    const key = parseMonth(toBEKey(r.ym));
    return key ? [{ ...key, count: Number(r.n) }] : [];
  });
});

function scopeWhere(m: MonthKey, province?: string, tsic?: string) {
  const where = [`j.register_date >= ?`, `j.register_date < ?`];
  const params: unknown[] = [m.start, m.end];
  if (province) {
    where.push(`j.province = ?`);
    params.push(province);
  }
  if (tsic) {
    where.push(`j.tsic_code = ?`);
    params.push(tsic);
  }
  return { where: where.join(" AND "), params };
}

export const getMonthStats = cache(async (ym: string, province?: string, tsic?: string) => {
  const m = parseMonth(ym);
  if (!m) return null;
  const { where, params } = scopeWhere(m, province, tsic);
  const [r] = await dbQuery<RowDataPacket[]>(
    `SELECT COUNT(*) n, COALESCE(SUM(register_capital), 0) cap, SUM(dissolved_date IS NOT NULL) dissolved,
       SUM(juristic_type = 'บริษัทจำกัด') companies, SUM(juristic_type LIKE 'ห้างหุ้นส่วน%') partnerships
     FROM juristic j WHERE ${where}`,
    params,
  );
  return {
    month: m,
    total: Number(r?.n ?? 0),
    capital: Number(r?.cap ?? 0),
    dissolved: Number(r?.dissolved ?? 0),
    companies: Number(r?.companies ?? 0),
    partnerships: Number(r?.partnerships ?? 0),
  };
});

/** ประเภทธุรกิจที่เปิดใหม่มากที่สุดในเดือนนั้น */
export const getMonthTopTsic = cache(async (ym: string, province?: string, limit = 15) => {
  const m = parseMonth(ym);
  if (!m) return [];
  const { where, params } = scopeWhere(m, province);
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT j.tsic_code code, t.name_th name, COUNT(*) n FROM juristic j LEFT JOIN tsic t ON t.code = j.tsic_code
     WHERE ${where} AND j.tsic_code IS NOT NULL GROUP BY j.tsic_code, t.name_th ORDER BY n DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map((r) => ({ code: r.code as string, name: (r.name as string | null)?.trim() ?? r.code, count: Number(r.n) }));
});

/** จำนวนบริษัทเปิดใหม่แยกจังหวัดในเดือนนั้น */
export const getMonthProvinces = cache(async (ym: string) => {
  const m = parseMonth(ym);
  if (!m) return [];
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT province, COUNT(*) n FROM juristic j WHERE j.register_date >= ? AND j.register_date < ?
       AND province IS NOT NULL GROUP BY province ORDER BY n DESC`,
    [m.start, m.end],
  );
  return rows.map((r) => ({ province: r.province as string, count: Number(r.n) }));
});

export function listMonthCompanies(
  ym: string,
  opts: { province?: string; tsic?: string; page?: number },
): Promise<JuristicProfile[]> {
  const m = parseMonth(ym);
  if (!m) return Promise.resolve([]);
  const { where, params } = scopeWhere(m, opts.province, opts.tsic);
  const page = Math.max(1, opts.page ?? 1);
  return listJuristicWhere(where, params, `j.register_date DESC, j.id DESC`, PAGE_SIZE, (page - 1) * PAGE_SIZE);
}

/** เดือน × จังหวัดที่มีบริษัทพอสำหรับ sitemap */
export async function listNewSitemapPaths(minCompanies = 5): Promise<string[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT DATE_FORMAT(register_date, '%Y-%m') ym, province, COUNT(*) n FROM juristic
     WHERE register_date >= ? AND register_date <= CURDATE() AND province IS NOT NULL
     GROUP BY ym, province HAVING n >= ?`,
    [NEW_SINCE_CE, minCompanies],
  );
  const months = new Set<string>();
  const paths: string[] = [];
  for (const r of rows) {
    const be = toBEKey(r.ym);
    months.add(be);
    paths.push(`/new/${be}/${encodeURIComponent(r.province)}`);
  }
  return ["/new", ...[...months].map((m) => `/new/${m}`), ...paths];
}

/** มีบริษัทจดทะเบียนในเดือนนี้อย่างน้อย 1 รายหรือไม่ (ใช้ index register_date — เร็ว) */
export const monthHasData = cache(async (ym: string): Promise<boolean> => {
  const m = parseMonth(ym);
  if (!m) return false;
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT 1 FROM juristic WHERE register_date >= ? AND register_date < ? LIMIT 1`,
    [m.start, m.end],
  );
  return rows.length > 0;
});
