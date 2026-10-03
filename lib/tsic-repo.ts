/**
 * Query สำหรับหน้า pSEO ตามประเภทธุรกิจ (TSIC) — /tsic, /tsic/[code], /tsic/[code]/[province]
 */
import "server-only";
import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { listJuristicWhere } from "@/lib/company-repo";
import type { JuristicProfile } from "@/types/company";

export interface TsicNode {
  code: string;
  level: number;
  name: string;
  section: string;
  parentCode: string | null;
}

export interface TsicStats {
  total: number;
  active: number;
  dissolved: number;
  totalCapital: number;
  /** ปี ค.ศ. ที่จดทะเบียนล่าสุด/เก่าสุดในชุดข้อมูล */
  firstYear: number | null;
  lastYear: number | null;
}

/** หน้าที่มีบริษัทน้อยกว่านี้ถือว่าเนื้อหาบาง → noindex และไม่ใส่ sitemap */
export const MIN_INDEXABLE_COMPANIES = 5;

const toNode = (r: RowDataPacket): TsicNode => ({
  code: r.code,
  level: r.level,
  name: r.name_th,
  section: r.section,
  parentCode: r.parent_code,
});

/** รหัส TSIC พร้อมสายหมวดแม่ (หมวดใหญ่ → ... → รหัสนี้) */
export const getTsicPath = cache(async (code: string): Promise<TsicNode[] | null> => {
  const [node] = await dbQuery<RowDataPacket[]>(`SELECT * FROM tsic WHERE code = ?`, [code]);
  if (!node) return null;
  const ancestors = [code.slice(0, 4), code.slice(0, 3), code.slice(0, 2), node.section].filter((c) => c !== code);
  const rows = await dbQuery<RowDataPacket[]>(`SELECT * FROM tsic WHERE code IN (?) ORDER BY level`, [ancestors]);
  return [...rows.map(toNode), toNode(node)];
});

export const getTsicStats = cache(async (code: string, province?: string): Promise<TsicStats> => {
  const [r] = await dbQuery<RowDataPacket[]>(
    `SELECT COUNT(*) total, SUM(dissolved_date IS NULL) active, SUM(dissolved_date IS NOT NULL) dissolved,
       COALESCE(SUM(register_capital), 0) capital, MIN(YEAR(register_date)) first_year, MAX(YEAR(register_date)) last_year
     FROM juristic WHERE tsic_code = ? ${province ? "AND province = ?" : ""}`,
    province ? [code, province] : [code],
  );
  return {
    total: Number(r?.total ?? 0),
    active: Number(r?.active ?? 0),
    dissolved: Number(r?.dissolved ?? 0),
    totalCapital: Number(r?.capital ?? 0),
    firstYear: r?.first_year ?? null,
    lastYear: r?.last_year ?? null,
  };
});

/** จำนวนนิติบุคคลแยกตามจังหวัดในหมวดนี้ (มากไปน้อย) */
export const getTsicProvinces = cache(async (code: string): Promise<Array<{ province: string; count: number }>> => {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT province, COUNT(*) n FROM juristic WHERE tsic_code = ? AND province IS NOT NULL
     GROUP BY province ORDER BY n DESC, province`,
    [code],
  );
  return rows.map((r) => ({ province: r.province, count: Number(r.n) }));
});

/** นิติบุคคลในหมวดนี้ (ยังดำเนินกิจการก่อน แล้วเรียงตามวันจดทะเบียนล่าสุด) */
export function listTsicCompanies(code: string, province?: string, limit = 100): Promise<JuristicProfile[]> {
  return listJuristicWhere(
    `j.tsic_code = ? ${province ? "AND j.province = ?" : ""}`,
    province ? [code, province] : [code],
    `(j.dissolved_date IS NULL) DESC, j.register_date DESC`,
    limit,
  );
}

/** รหัส 5 หลักอื่นในหมู่ย่อยเดียวกัน (สำหรับลิงก์ "ประเภทธุรกิจที่เกี่ยวข้อง") */
export const getTsicSiblings = cache(async (code: string): Promise<Array<{ node: TsicNode; count: number }>> => {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT t.*, (SELECT COUNT(*) FROM juristic j WHERE j.tsic_code = t.code) n
     FROM tsic t WHERE t.level = 5 AND t.code <> ? AND t.parent_code = (SELECT parent_code FROM tsic WHERE code = ?)
     ORDER BY n DESC`,
    [code, code],
  );
  return rows.filter((r) => Number(r.n) > 0).map((r) => ({ node: toNode(r), count: Number(r.n) }));
});

export interface TsicTreeSection {
  node: TsicNode;
  count: number;
  divisions: Array<{ node: TsicNode; count: number; codes: Array<{ node: TsicNode; count: number }> }>;
}

/** ต้นไม้ หมวดใหญ่ → หมวดย่อย 2 หลัก → รหัส 5 หลัก (เฉพาะที่มีนิติบุคคล) สำหรับหน้า /tsic */
export const getTsicTree = cache(async (): Promise<TsicTreeSection[]> => {
  const [nodes, counts] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT * FROM tsic WHERE level IN (1, 2, 5) ORDER BY code`),
    dbQuery<RowDataPacket[]>(`SELECT tsic_code, COUNT(*) n FROM juristic WHERE tsic_code IS NOT NULL GROUP BY tsic_code`),
  ]);
  const countOf = new Map(counts.map((c) => [c.tsic_code as string, Number(c.n)]));
  const sections = new Map<string, TsicTreeSection>();
  const divisions = new Map<string, TsicTreeSection["divisions"][number]>();

  for (const r of nodes.filter((n) => n.level === 1)) sections.set(r.code, { node: toNode(r), count: 0, divisions: [] });
  for (const r of nodes.filter((n) => n.level === 2)) {
    const d = { node: toNode(r), count: 0, codes: [] };
    divisions.set(r.code, d);
    sections.get(r.section)?.divisions.push(d);
  }
  for (const r of nodes.filter((n) => n.level === 5)) {
    const n = countOf.get(r.code) ?? 0;
    if (n === 0) continue;
    const d = divisions.get(String(r.code).slice(0, 2));
    if (!d) continue;
    d.codes.push({ node: toNode(r), count: n });
    d.count += n;
    sections.get(r.section)!.count += n;
  }
  for (const s of sections.values()) {
    s.divisions = s.divisions.filter((d) => d.count > 0);
    for (const d of s.divisions) d.codes.sort((a, b) => b.count - a.count);
  }
  return [...sections.values()].filter((s) => s.count > 0);
});

/** URL ทั้งหมดของหน้าประเภทธุรกิจที่มีเนื้อหาพอ สำหรับ sitemap */
export async function listTsicSitemapPaths(): Promise<string[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT tsic_code, province, COUNT(*) n FROM juristic
     WHERE tsic_code IS NOT NULL AND province IS NOT NULL GROUP BY tsic_code, province`,
  );
  const perCode = new Map<string, number>();
  const combos: string[] = [];
  for (const r of rows) {
    perCode.set(r.tsic_code, (perCode.get(r.tsic_code) ?? 0) + Number(r.n));
    if (Number(r.n) >= MIN_INDEXABLE_COMPANIES) combos.push(`/tsic/${r.tsic_code}/${encodeURIComponent(r.province)}`);
  }
  const codes = [...perCode].filter(([, n]) => n >= MIN_INDEXABLE_COMPANIES).map(([c]) => `/tsic/${c}`);
  return ["/tsic", ...codes, ...combos];
}
