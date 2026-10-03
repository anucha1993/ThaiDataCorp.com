/**
 * ค้นหาขั้นสูงข้อมูลจัดซื้อจัดจ้างภาครัฐ (สมาชิก) — สัญญา / ผู้รับสัญญา / หน่วยงาน
 * ใช้ร่วมกันระหว่างหน้าค้นหาและ route ดาวน์โหลด CSV
 */
import "server-only";
import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { isValidJuristicId } from "@/lib/juristic-id";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
const num = (v?: string) => {
  const n = Number(v?.replace(/[,\s]/g, ""));
  return v && Number.isFinite(n) && n >= 0 ? n : undefined;
};
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const VALUE = "COALESCE(c.contract_value, c.agreed_price, 0)";

function toQuery(entries: Record<string, string | number | boolean | undefined>, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) if (v !== undefined && v !== "" && v !== false) q.set(k, v === true ? "1" : String(v));
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

/* ------------------------------------------------------------------ สัญญา */

export const CONTRACT_SORTS = { new: "ลงนามล่าสุด", value: "มูลค่าสูงสุด" } as const;

export interface ContractFilters {
  /** คำในชื่อโครงการ */
  q?: string;
  /** หน่วยงาน (ตรงตัว — มาจากลิงก์หน้าหน่วยงาน) */
  agency?: string;
  /** คำในชื่อหน่วยงาน */
  agencyQ?: string;
  /** ผู้ชนะ: เลขนิติบุคคล 13 หลัก หรือคำในชื่อ */
  winner?: string;
  province?: string;
  method?: string;
  type?: string;
  from?: string;
  to?: string;
  vmin?: number;
  vmax?: number;
  sort: keyof typeof CONTRACT_SORTS;
}

export function parseContractFilters(sp: Params): ContractFilters {
  const sort = one(sp.sort);
  return {
    q: one(sp.q)?.slice(0, 200),
    agency: one(sp.agency)?.slice(0, 255),
    agencyQ: one(sp.agency_q)?.slice(0, 200),
    winner: one(sp.winner)?.slice(0, 200),
    province: one(sp.province)?.slice(0, 64),
    method: one(sp.method)?.slice(0, 128),
    type: one(sp.type)?.slice(0, 64),
    from: date(one(sp.from)),
    to: date(one(sp.to)),
    vmin: num(one(sp.vmin)),
    vmax: num(one(sp.vmax)),
    sort: sort === "value" ? "value" : "new",
  };
}

export function contractQuery(f: ContractFilters, extra?: Record<string, string>): string {
  return toQuery(
    { q: f.q, agency: f.agency, agency_q: f.agencyQ, winner: f.winner, province: f.province, method: f.method, type: f.type,
      from: f.from, to: f.to, vmin: f.vmin, vmax: f.vmax, sort: f.sort === "new" ? undefined : f.sort },
    extra,
  );
}

export function hasContractFilter(f: ContractFilters): boolean {
  return Boolean(f.q || f.agency || f.agencyQ || f.winner || f.province || f.method || f.type || f.from || f.to || f.vmin != null || f.vmax != null);
}

function contractWhere(f: ContractFilters): { where: string; params: unknown[] } {
  const w: string[] = ["1=1"];
  const p: unknown[] = [];
  if (f.q) (w.push("c.project_name LIKE ?"), p.push(like(f.q)));
  if (f.agency) (w.push("c.agency = ?"), p.push(f.agency));
  if (f.agencyQ) (w.push("(c.agency LIKE ? OR c.sub_agency LIKE ?)"), p.push(like(f.agencyQ), like(f.agencyQ)));
  if (f.winner) {
    const id = f.winner.replace(/\D/g, "");
    if (isValidJuristicId(id)) (w.push("c.winner_id = ?"), p.push(id));
    else (w.push("c.winner_name LIKE ?"), p.push(like(f.winner)));
  }
  if (f.province) (w.push("c.province = ?"), p.push(f.province));
  if (f.method) (w.push("c.method = ?"), p.push(f.method));
  if (f.type) (w.push("c.project_type = ?"), p.push(f.type));
  if (f.from) (w.push("c.sign_date >= ?"), p.push(f.from));
  if (f.to) (w.push("c.sign_date <= ?"), p.push(f.to));
  if (f.vmin != null) (w.push(`${VALUE} >= ?`), p.push(f.vmin));
  if (f.vmax != null) (w.push(`${VALUE} <= ?`), p.push(f.vmax));
  return { where: w.join(" AND "), params: p };
}

const CONTRACT_COLUMNS = `c.fiscal_year, c.seq, c.project_id, c.project_name, c.project_type, c.agency, c.sub_agency, c.method,
  c.budget, c.ref_price, c.agreed_price, c.contract_value, ${VALUE} AS value, c.province, c.district, c.winner_id,
  c.winner_name, c.contract_no, c.sign_date, c.end_date, c.contract_status`;

// เรียงตาม (sign_date, fiscal_year, seq) = ลำดับเดียวกับ index idx_sign (+ primary key) → อ่าน index ย้อนหลังได้เลย ไม่ต้อง filesort
const CONTRACT_ORDER = {
  new: "c.sign_date DESC, c.fiscal_year DESC, c.seq DESC",
  value: `${VALUE} DESC`,
} as const;

/** เวลาสูงสุดต่อ query (วินาที) — การเรียงตามมูลค่าใช้ index ไม่ได้ ถ้าตัวกรองกว้างเกินจะช้ามาก */
const MAX_SECONDS = 8;
const isTimeout = (e: unknown) => (e as { errno?: number }).errno === 1969;

/**
 * ไม่นับจำนวนทั้งหมด (สัญญา 2 ล้านแถว นับทุกครั้งช้าเกินไป) — ดึงเกิน 1 แถวเพื่อรู้ว่ามีหน้าถัดไปไหม
 * timedOut = ตัวกรองกว้างเกินไปสำหรับการเรียงแบบนี้
 */
export async function searchContracts(f: ContractFilters, page: number, pageSize = 50) {
  const { where, params } = contractWhere(f);
  try {
    const rows = await dbQuery<RowDataPacket[]>(
      `SET STATEMENT max_statement_time=${MAX_SECONDS} FOR
       SELECT ${CONTRACT_COLUMNS} FROM procurement_contract c WHERE ${where} ORDER BY ${CONTRACT_ORDER[f.sort]} LIMIT ? OFFSET ?`,
      [...params, pageSize + 1, (page - 1) * pageSize],
    );
    return { rows: rows.slice(0, pageSize), hasNext: rows.length > pageSize, timedOut: false };
  } catch (e) {
    if (isTimeout(e)) return { rows: [], hasNext: false, timedOut: true };
    throw e;
  }
}

/** สำหรับ CSV — คืน null ถ้าตัวกรองกว้างเกินไป (เกินเวลา) */
export async function contractRows(f: ContractFilters, limit: number): Promise<RowDataPacket[] | null> {
  const { where, params } = contractWhere(f);
  try {
    return await dbQuery<RowDataPacket[]>(
      `SET STATEMENT max_statement_time=${MAX_SECONDS * 3} FOR
       SELECT ${CONTRACT_COLUMNS} FROM procurement_contract c WHERE ${where} ORDER BY ${CONTRACT_ORDER[f.sort]} LIMIT ?`,
      [...params, limit],
    );
  } catch (e) {
    if (isTimeout(e)) return null;
    throw e;
  }
}

/** ค่าที่ใช้ในรายการเลือก (วิธีจัดซื้อ / ประเภทโครงการ) — ค่าคงที่ของชุดข้อมูล e-GP */
export const CONTRACT_METHODS = [
  "เฉพาะเจาะจง",
  "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
  "คัดเลือก",
  "งานจ้างที่ปรึกษา",
  "งานจ้างออกแบบและควบคุมงาน",
  "ตลาดอิเล็กทรอนิกส์ (e-market)",
];
export const CONTRACT_TYPES = ["ซื้อ", "จ้างทำของ/จ้างเหมาบริการ", "จ้างก่อสร้าง", "เช่า", "จ้างที่ปรึกษา", "จ้างออกแบบ", "จ้างควบคุมงาน"];

/** จังหวัดที่ตั้งโครงการ (จากตารางสรุป — เร็ว) */
export const listContractProvinces = cache(async (): Promise<string[]> => {
  const rows = await dbQuery<RowDataPacket[]>(`SELECT DISTINCT province FROM procurement_province_winner`);
  return rows.map((r) => r.province as string).sort((a, b) => a.localeCompare(b, "th"));
});

/* ------------------------------------------------------------- ผู้รับสัญญา */

export const WINNER_SORTS = { value: "มูลค่ารวมสูงสุด", contracts: "จำนวนสัญญามากสุด" } as const;

export interface WinnerFilters {
  q?: string;
  province?: string;
  minContracts?: number;
  minValue?: number;
  sort: keyof typeof WINNER_SORTS;
}

export function parseWinnerFilters(sp: Params): WinnerFilters {
  return {
    q: one(sp.q)?.slice(0, 200),
    province: one(sp.province)?.slice(0, 64),
    minContracts: num(one(sp.min_contracts)),
    minValue: num(one(sp.min_value)),
    sort: one(sp.sort) === "contracts" ? "contracts" : "value",
  };
}

export function winnerQuery(f: WinnerFilters, extra?: Record<string, string>): string {
  return toQuery(
    { q: f.q, province: f.province, min_contracts: f.minContracts, min_value: f.minValue, sort: f.sort === "value" ? undefined : f.sort },
    extra,
  );
}

function winnerSql(f: WinnerFilters) {
  // จังหวัด = ยอดเฉพาะโครงการในจังหวัดนั้น (ตารางสรุปรายจังหวัด) · ไม่เลือก = ยอดทั้งประเทศ
  const from = f.province
    ? `procurement_province_winner w JOIN procurement_summary s ON s.winner_id = w.winner_id`
    : `procurement_summary w JOIN procurement_summary s ON s.winner_id = w.winner_id`;
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (f.province) (where.push("w.province = ?"), params.push(f.province));
  if (f.q) {
    const id = f.q.replace(/\D/g, "");
    if (isValidJuristicId(id)) (where.push("w.winner_id = ?"), params.push(id));
    else (where.push("s.winner_name LIKE ?"), params.push(like(f.q)));
  }
  if (f.minContracts != null) (where.push("w.contracts >= ?"), params.push(f.minContracts));
  if (f.minValue != null) (where.push("w.total_value >= ?"), params.push(f.minValue));
  const order = f.sort === "contracts" ? "w.contracts DESC, w.total_value DESC" : "w.total_value DESC";
  return { from, where: where.join(" AND "), params, order };
}

const WINNER_COLUMNS = `w.winner_id, s.winner_name, w.contracts, w.total_value, s.agencies, s.first_sign, s.last_sign`;

export async function searchWinners(f: WinnerFilters, page: number, pageSize = 50) {
  const { from, where, params, order } = winnerSql(f);
  const [rows, count] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT ${WINNER_COLUMNS} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [
      ...params,
      pageSize,
      (page - 1) * pageSize,
    ]),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM ${from} WHERE ${where}`, params),
  ]);
  return { rows, total: Number(count[0]?.n ?? 0) };
}

export function winnerRows(f: WinnerFilters, limit: number) {
  const { from, where, params, order } = winnerSql(f);
  return dbQuery<RowDataPacket[]>(`SELECT ${WINNER_COLUMNS} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ?`, [...params, limit]);
}

/* -------------------------------------------------------------- หน่วยงาน */

export const AGENCY_SORTS = { value: "มูลค่ารวมสูงสุด", contracts: "จำนวนสัญญามากสุด", winners: "จำนวนผู้รับสัญญามากสุด" } as const;

export interface AgencyFilters {
  q?: string;
  province?: string;
  minContracts?: number;
  minValue?: number;
  sort: keyof typeof AGENCY_SORTS;
}

export function parseAgencyFilters(sp: Params): AgencyFilters {
  const sort = one(sp.sort);
  return {
    q: one(sp.q)?.slice(0, 200),
    province: one(sp.province)?.slice(0, 64),
    minContracts: num(one(sp.min_contracts)),
    minValue: num(one(sp.min_value)),
    sort: sort === "contracts" || sort === "winners" ? sort : "value",
  };
}

export function agencyQuery(f: AgencyFilters, extra?: Record<string, string>): string {
  return toQuery(
    { q: f.q, province: f.province, min_contracts: f.minContracts, min_value: f.minValue, sort: f.sort === "value" ? undefined : f.sort },
    extra,
  );
}

function agencySql(f: AgencyFilters) {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (f.q) (where.push("a.agency LIKE ?"), params.push(like(f.q)));
  if (f.province) (where.push("a.top_province = ?"), params.push(f.province));
  if (f.minContracts != null) (where.push("a.contracts >= ?"), params.push(f.minContracts));
  if (f.minValue != null) (where.push("a.total_value >= ?"), params.push(f.minValue));
  const order = { value: "a.total_value DESC", contracts: "a.contracts DESC", winners: "a.winners DESC" }[f.sort];
  return { where: where.join(" AND "), params, order };
}

export async function searchAgencies(f: AgencyFilters, page: number, pageSize = 50) {
  const { where, params, order } = agencySql(f);
  const [rows, count] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT a.* FROM procurement_agency_summary a WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [
      ...params,
      pageSize,
      (page - 1) * pageSize,
    ]),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM procurement_agency_summary a WHERE ${where}`, params),
  ]);
  return { rows, total: Number(count[0]?.n ?? 0) };
}

export function agencyRows(f: AgencyFilters, limit: number) {
  const { where, params, order } = agencySql(f);
  return dbQuery<RowDataPacket[]>(`SELECT a.* FROM procurement_agency_summary a WHERE ${where} ORDER BY ${order} LIMIT ?`, [...params, limit]);
}
