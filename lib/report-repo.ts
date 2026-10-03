/**
 * รายงานดัชนีธุรกิจไทยรายเดือน — สร้างอัตโนมัติจากข้อมูลใน DB (ไม่มีคนเขียน)
 *   จดทะเบียนใหม่ / เลิกกิจการ / ธุรกิจมาแรง / จังหวัด / จด VAT ใหม่ / งานภาครัฐ / ความเคลื่อนไหวนิติบุคคล
 * แสดงเฉพาะเดือนที่จบแล้ว (เดือนปัจจุบันข้อมูลยังไม่ครบ)
 */
import "server-only";
import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { listNewMonths, parseMonth, type MonthKey } from "@/lib/new-repo";

/** จำนวนขั้นต่ำที่ถือว่าเดือนนั้นมีข้อมูลชุดรายเดือนครบแล้ว */
const MIN_COMPANIES = 1000;

const SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function shiftMonth(m: MonthKey, d: number): MonthKey | null {
  const idx = m.yearBE * 12 + (m.month - 1) + d;
  return parseMonth(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
}

/** เดือนที่ออกรายงานได้ (จบเดือนแล้ว และมีข้อมูลจดทะเบียนใหม่) — ล่าสุดก่อน */
export const listReportMonths = cache(async () => {
  const now = new Date();
  const currentIdx = (now.getFullYear() + 543) * 12 + now.getMonth();
  const months = await listNewMonths();
  // ต้องมีข้อมูลชุดรายเดือนแล้ว (เดือนที่มีแค่บริษัทที่ดึงจาก DBD ทีละรายจะมีไม่กี่ราย — ยังไม่ออกรายงาน)
  return months.filter((m) => m.yearBE * 12 + m.month - 1 < currentIdx && m.count >= MIN_COMPANIES);
});

export interface MonthlyReport {
  month: MonthKey;
  prev: MonthKey | null;
  newCount: number;
  prevCount: number | null;
  lastYearCount: number | null;
  capital: number;
  dissolved: number;
  types: Array<{ name: string; count: number }>;
  topTsic: Array<{ code: string; name: string; count: number; prev: number }>;
  /** เติบโตเร็วสุดเทียบเดือนก่อน (เฉพาะหมวดที่มีอย่างน้อย 20 ราย) */
  risingTsic: Array<{ code: string; name: string; count: number; prev: number }>;
  provinces: Array<{ province: string; count: number; prev: number }>;
  trend: Array<{ ym: string; label: string; short: string; count: number }>;
  vatNew: number;
  gov: { contracts: number; value: number; agencies: Array<{ agency: string; value: number; contracts: number }>; winners: Array<{ id: string; name: string; value: number; contracts: number }> };
  changes: Array<{ field: string; count: number }>;
  capitalUp: { count: number; total: number };
}

const countIn = async (m: MonthKey | null) => {
  if (!m) return null;
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM juristic WHERE register_date >= ? AND register_date < ?`, [m.start, m.end]);
  return Number(r?.n ?? 0);
};

export const getMonthlyReport = cache(async (ym: string): Promise<MonthlyReport | null> => {
  const month = parseMonth(ym);
  if (!month) return null;
  const available = await listReportMonths();
  if (!available.some((m) => m.ym === ym)) return null;
  const prev = shiftMonth(month, -1);
  const lastYear = shiftMonth(month, -12);
  const range = [month.start, month.end];

  const [
    [base],
    prevCount,
    lastYearCount,
    [diss],
    types,
    tsicNow,
    tsicPrev,
    provNow,
    provPrev,
    [vat],
    [gov],
    agencies,
    winners,
    changes,
    [capUp],
  ] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n, COALESCE(SUM(register_capital), 0) cap FROM juristic WHERE register_date >= ? AND register_date < ?`, range),
    countIn(prev),
    countIn(lastYear),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM juristic WHERE dissolved_date >= ? AND dissolved_date < ?`, range),
    dbQuery<RowDataPacket[]>(
      `SELECT juristic_type name, COUNT(*) n FROM juristic WHERE register_date >= ? AND register_date < ? GROUP BY juristic_type ORDER BY n DESC`,
      range,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT j.tsic_code code, MAX(t.name_th) name, COUNT(*) n FROM juristic j LEFT JOIN tsic t ON t.code = j.tsic_code
       WHERE j.register_date >= ? AND j.register_date < ? AND j.tsic_code IS NOT NULL GROUP BY j.tsic_code ORDER BY n DESC LIMIT 200`,
      range,
    ),
    prev
      ? dbQuery<RowDataPacket[]>(
          `SELECT tsic_code code, COUNT(*) n FROM juristic WHERE register_date >= ? AND register_date < ? AND tsic_code IS NOT NULL GROUP BY tsic_code`,
          [prev.start, prev.end],
        )
      : Promise.resolve([] as RowDataPacket[]),
    dbQuery<RowDataPacket[]>(
      `SELECT province, COUNT(*) n FROM juristic WHERE register_date >= ? AND register_date < ? AND province IS NOT NULL GROUP BY province ORDER BY n DESC LIMIT 10`,
      range,
    ),
    prev
      ? dbQuery<RowDataPacket[]>(
          `SELECT province, COUNT(*) n FROM juristic WHERE register_date >= ? AND register_date < ? AND province IS NOT NULL GROUP BY province`,
          [prev.start, prev.end],
        )
      : Promise.resolve([] as RowDataPacket[]),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM juristic_vat WHERE branch_no = 0 AND approved_date >= ? AND approved_date < ?`, range),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) n, COALESCE(SUM(COALESCE(contract_value, agreed_price, 0)), 0) v FROM procurement_contract WHERE sign_date >= ? AND sign_date < ?`,
      range,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT agency, COUNT(*) n, SUM(COALESCE(contract_value, agreed_price, 0)) v FROM procurement_contract
       WHERE sign_date >= ? AND sign_date < ? AND agency IS NOT NULL GROUP BY agency ORDER BY v DESC LIMIT 5`,
      range,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT c.winner_id id, COALESCE(MAX(j.name_th), MAX(c.winner_name)) name, COUNT(*) n, SUM(COALESCE(c.contract_value, c.agreed_price, 0)) v
       FROM procurement_contract c LEFT JOIN juristic j ON j.id = c.winner_id
       WHERE c.sign_date >= ? AND c.sign_date < ? AND c.winner_id NOT LIKE '099%' GROUP BY c.winner_id ORDER BY v DESC LIMIT 5`,
      range,
    ),
    dbQuery<RowDataPacket[]>(`SELECT field, COUNT(*) n FROM juristic_change WHERE detected_at >= ? AND detected_at < ? GROUP BY field ORDER BY n DESC`, range),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) n, COALESCE(SUM(CAST(new_value AS DECIMAL(20,2)) - CAST(old_value AS DECIMAL(20,2))), 0) total
       FROM juristic_change WHERE field = 'capital' AND detected_at >= ? AND detected_at < ?
         AND CAST(new_value AS DECIMAL(20,2)) > CAST(old_value AS DECIMAL(20,2))`,
      range,
    ),
  ]);

  const prevTsic = new Map(tsicPrev.map((r) => [r.code as string, Number(r.n)]));
  const tsic = tsicNow.map((r) => ({
    code: r.code as string,
    name: String(r.name ?? r.code).trim(),
    count: Number(r.n),
    prev: prevTsic.get(r.code) ?? 0,
  }));
  const prevProv = new Map(provPrev.map((r) => [r.province as string, Number(r.n)]));

  // แนวโน้ม 13 เดือน (สิ้นสุดที่เดือนรายงาน)
  const months = (await listNewMonths()).filter((m) => m.yearBE * 12 + m.month <= month.yearBE * 12 + month.month).slice(0, 13).reverse();

  return {
    month,
    prev,
    newCount: Number(base?.n ?? 0),
    prevCount,
    lastYearCount: lastYear && lastYear.yearBE >= 2565 ? lastYearCount : null,
    capital: Number(base?.cap ?? 0),
    dissolved: Number(diss?.n ?? 0),
    types: types.map((r) => ({ name: String(r.name ?? "-"), count: Number(r.n) })),
    topTsic: tsic.slice(0, 10),
    risingTsic: tsic
      .filter((t) => t.count >= 20 && t.prev > 0)
      .sort((a, b) => b.count / b.prev - a.count / a.prev)
      .slice(0, 5),
    provinces: provNow.map((r) => ({ province: r.province, count: Number(r.n), prev: prevProv.get(r.province) ?? 0 })),
    trend: months.map((m) => ({ ym: m.ym, label: m.label, short: `${SHORT[m.month - 1]} ${String(m.yearBE).slice(2)}`, count: m.count })),
    vatNew: Number(vat?.n ?? 0),
    gov: {
      contracts: Number(gov?.n ?? 0),
      value: Number(gov?.v ?? 0),
      agencies: agencies.map((r) => ({ agency: r.agency, contracts: Number(r.n), value: Number(r.v) })),
      winners: winners.map((r) => ({ id: r.id, name: String(r.name ?? r.id), contracts: Number(r.n), value: Number(r.v) })),
    },
    changes: changes.map((r) => ({ field: r.field as string, count: Number(r.n) })),
    capitalUp: { count: Number(capUp?.n ?? 0), total: Number(capUp?.total ?? 0) },
  };
});
