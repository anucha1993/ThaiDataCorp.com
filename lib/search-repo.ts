/**
 * ค้นหาขั้นสูง (สมาชิก) — ชื่อ + ประเภทธุรกิจ + จังหวัด + ประเภทนิติบุคคล + สถานะ + ช่วงวันจดทะเบียน + ทุน + เคยได้งานรัฐ
 * ใช้ร่วมกันระหว่างหน้า /search และ /export/search (CSV)
 */
import "server-only";
import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { listJuristicWhere } from "@/lib/company-repo";
import type { JuristicProfile } from "@/types/company";

export const SEARCH_PAGE_SIZE = 50;

export const SORTS = {
  new: { label: "จดทะเบียนล่าสุด", sql: "j.register_date DESC, j.id DESC" },
  old: { label: "จดทะเบียนเก่าสุด", sql: "j.register_date ASC, j.id ASC" },
  capital: { label: "ทุนจดทะเบียนมากสุด", sql: "j.register_capital DESC, j.id DESC" },
  name: { label: "ชื่อ ก–ฮ", sql: "j.name_th ASC" },
} as const;
export type SortKey = keyof typeof SORTS;

export const JURISTIC_TYPES = ["บริษัทจำกัด", "ห้างหุ้นส่วนจำกัด", "ห้างหุ้นส่วนสามัญนิติบุคคล", "บริษัทมหาชนจำกัด"] as const;

export interface SearchFilters {
  q?: string;
  /** รหัส TSIC 2–5 หลัก (2 หลัก = ทั้งหมวดย่อย, 5 หลัก = กิจกรรมเจาะจง) */
  tsic?: string;
  province?: string;
  type?: string;
  status?: "active" | "dissolved";
  /** วันจดทะเบียน YYYY-MM-DD (ค.ศ.) */
  from?: string;
  to?: string;
  capMin?: number;
  capMax?: number;
  /** เคยได้งานภาครัฐ (e-GP) */
  gov?: boolean;
  /** จดทะเบียนภาษีมูลค่าเพิ่ม (กรมสรรพากร) */
  vat?: boolean;
  sort: SortKey;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
const money = (v?: string) => {
  const n = Number(v?.replace(/[,\s]/g, ""));
  return v && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function parseFilters(sp: Params): SearchFilters {
  // ช่องรหัส TSIC ที่พิมพ์เอง (tsic_code) มาก่อนหมวดที่เลือกจากรายการ (tsic)
  const tsic = [one(sp.tsic_code), one(sp.tsic)].find((t) => t && /^\d{2,5}$/.test(t));
  const status = one(sp.status);
  const sort = one(sp.sort);
  const type = one(sp.type);
  return {
    q: one(sp.q)?.slice(0, 200),
    tsic,
    province: one(sp.province)?.slice(0, 128),
    type: JURISTIC_TYPES.includes(type as (typeof JURISTIC_TYPES)[number]) ? type : undefined,
    status: status === "active" || status === "dissolved" ? status : undefined,
    from: date(one(sp.from)),
    to: date(one(sp.to)),
    capMin: money(one(sp.cap_min)),
    capMax: money(one(sp.cap_max)),
    gov: one(sp.gov) === "1",
    vat: one(sp.vat) === "1",
    sort: sort && sort in SORTS ? (sort as SortKey) : "new",
  };
}

/** ใช้ตัวกรองขั้นสูงอยู่หรือไม่ (นอกจากชื่อ) */
export function hasAdvanced(f: SearchFilters): boolean {
  return Boolean(f.tsic || f.province || f.type || f.status || f.from || f.to || f.capMin != null || f.capMax != null || f.gov || f.vat || f.sort !== "new");
}

/** แปลงตัวกรองกลับเป็น query string (สำหรับลิงก์หน้าถัดไป / CSV) */
export function filtersToQuery(f: SearchFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.q) q.set("q", f.q);
  if (f.tsic) q.set("tsic", f.tsic);
  if (f.province) q.set("province", f.province);
  if (f.type) q.set("type", f.type);
  if (f.status) q.set("status", f.status);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.capMin != null) q.set("cap_min", String(f.capMin));
  if (f.capMax != null) q.set("cap_max", String(f.capMax));
  if (f.gov) q.set("gov", "1");
  if (f.vat) q.set("vat", "1");
  if (f.sort !== "new") q.set("sort", f.sort);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

function buildWhere(f: SearchFilters): { where: string; params: unknown[] } {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push("(j.name_th LIKE ? OR j.name_raw LIKE ? OR j.name_en LIKE ?)");
    params.push(like, like, like);
  }
  if (f.tsic) {
    if (f.tsic.length === 5) (where.push("j.tsic_code = ?"), params.push(f.tsic));
    else (where.push("j.tsic_code LIKE ?"), params.push(`${f.tsic}%`));
  }
  if (f.province) (where.push("j.province = ?"), params.push(f.province));
  if (f.type) (where.push("j.juristic_type = ?"), params.push(f.type));
  // สถานะ: ใช้สถานะล่าสุดจาก DBD ถ้ามี ไม่งั้นดูจากวันเลิกกิจการ
  const active = "(j.dissolved_date IS NULL AND (j.status_text IS NULL OR j.status_text LIKE '%ดำเนินกิจการ%'))";
  if (f.status === "active") where.push(active);
  if (f.status === "dissolved") where.push(`NOT ${active}`);
  if (f.from) (where.push("j.register_date >= ?"), params.push(f.from));
  if (f.to) (where.push("j.register_date <= ?"), params.push(f.to));
  if (f.capMin != null) (where.push("j.register_capital >= ?"), params.push(f.capMin));
  if (f.capMax != null) (where.push("j.register_capital <= ?"), params.push(f.capMax));
  if (f.gov) where.push("EXISTS (SELECT 1 FROM procurement_summary ps WHERE ps.winner_id = j.id)");
  if (f.vat) where.push("EXISTS (SELECT 1 FROM juristic_vat jv WHERE jv.tax_id = j.id)");
  return { where: where.join(" AND "), params };
}

export async function advancedSearch(
  f: SearchFilters,
  page: number,
  pageSize = SEARCH_PAGE_SIZE,
): Promise<{ rows: JuristicProfile[]; total: number }> {
  const { where, params } = buildWhere(f);
  const [rows, count] = await Promise.all([
    listJuristicWhere(where, params, SORTS[f.sort].sql, pageSize, (page - 1) * pageSize),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM juristic j WHERE ${where}`, params),
  ]);
  return { rows, total: Number(count[0]?.n ?? 0) };
}

/** สำหรับ CSV — ไม่นับจำนวน */
export function advancedSearchRows(f: SearchFilters, limit: number): Promise<JuristicProfile[]> {
  const { where, params } = buildWhere(f);
  return listJuristicWhere(where, params, SORTS[f.sort].sql, limit);
}

/** หมวดใหญ่ (A–U) + หมวดย่อย 2 หลัก สำหรับรายการเลือกประเภทธุรกิจ */
export const listTsicDivisions = cache(async () => {
  const rows = await dbQuery<RowDataPacket[]>(`SELECT code, level, name_th, section FROM tsic WHERE level IN (1, 2) ORDER BY section, level, code`);
  const sections: Array<{ code: string; name: string; divisions: Array<{ code: string; name: string }> }> = [];
  for (const r of rows) {
    if (Number(r.level) === 1) sections.push({ code: r.code, name: String(r.name_th).trim(), divisions: [] });
    else sections.find((s) => s.code === r.section)?.divisions.push({ code: r.code, name: String(r.name_th).trim() });
  }
  return sections.filter((s) => s.divisions.length > 0);
});

export const listProvinces = cache(async (): Promise<string[]> => {
  const rows = await dbQuery<RowDataPacket[]>(`SELECT DISTINCT province FROM juristic WHERE province IS NOT NULL AND province <> ''`);
  return rows.map((r) => r.province as string).sort((a, b) => a.localeCompare(b, "th"));
});
