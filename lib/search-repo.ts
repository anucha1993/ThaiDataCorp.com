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

export { SORTS, JURISTIC_TYPES, parseFilters, hasAdvanced, filtersToQuery, buildWhere, describeFilters, filtersFromQuery } from "@/lib/search-filters";
export type { SortKey, SearchFilters } from "@/lib/search-filters";
import { SORTS, buildWhere, type SearchFilters } from "@/lib/search-filters";

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
