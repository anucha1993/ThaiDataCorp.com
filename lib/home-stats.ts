/**
 * ตัวเลขภาพรวมสำหรับหน้าแรก (portal + analytics) — หน้าแรกเป็น ISR จึงคำนวณวันละครั้ง
 */
import "server-only";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { listNewMonths } from "@/lib/new-repo";
import { listProcurementProvinces } from "@/lib/procurement-repo";

export interface HomeStats {
  juristic: number;
  active: number;
  tsicCodes: number;
  provinces: number;
  latestMonth: { ym: string; label: string; count: number } | null;
  months: Array<{ ym: string; label: string; short: string; count: number }>;
  topProvinces: Array<{ name: string; count: number }>;
  topTsic: Array<{ code: string; name: string; count: number }>;
  types: Array<{ name: string; count: number }>;
  avgCapital: number;
  lastYearTotal: number;
  contracts: number;
  contractValue: number;
  winners: number;
  agencies: number;
  procurementProvinces: Array<{ name: string; value: number; contracts: number }>;
}

const SHORT_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export async function getHomeStats(): Promise<HomeStats> {
  // ช่วง 12 เดือนล่าสุด (ใช้กับอันดับจังหวัด/ประเภทธุรกิจ/สัดส่วนประเภทนิติบุคคล)
  const last12 = `j.register_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) AND j.register_date <= CURDATE()`;
  const [totals, months, provinces, tsic, types, proc, procProvinces] = await Promise.all([
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) n,
         SUM(dissolved_date IS NULL AND (status_text IS NULL OR status_text LIKE '%ดำเนินกิจการ%')) active,
         COUNT(DISTINCT tsic_code) tsic, COUNT(DISTINCT province) provinces
       FROM juristic`,
    ),
    listNewMonths(),
    dbQuery<RowDataPacket[]>(
      `SELECT j.province name, COUNT(*) n FROM juristic j WHERE ${last12} AND j.province IS NOT NULL
       GROUP BY j.province ORDER BY n DESC LIMIT 10`,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT j.tsic_code code, t.name_th name, COUNT(*) n FROM juristic j LEFT JOIN tsic t ON t.code = j.tsic_code
       WHERE ${last12} AND j.tsic_code IS NOT NULL GROUP BY j.tsic_code, t.name_th ORDER BY n DESC LIMIT 10`,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT j.juristic_type name, COUNT(*) n, AVG(j.register_capital) cap FROM juristic j WHERE ${last12}
       GROUP BY j.juristic_type ORDER BY n DESC`,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT (SELECT SUM(contracts) FROM procurement_summary) contracts, (SELECT SUM(total_value) FROM procurement_summary) value,
         (SELECT COUNT(*) FROM procurement_summary) winners, (SELECT COUNT(*) FROM procurement_agency_summary) agencies`,
    ),
    listProcurementProvinces(),
  ]);

  const t = totals[0] ?? {};
  const typeRows = types.map((r) => ({ name: String(r.name), count: Number(r.n), cap: Number(r.cap) }));
  const lastYearTotal = typeRows.reduce((s, r) => s + r.count, 0);
  const p = proc[0] ?? {};

  return {
    juristic: Number(t.n ?? 0),
    active: Number(t.active ?? 0),
    tsicCodes: Number(t.tsic ?? 0),
    provinces: Number(t.provinces ?? 0),
    latestMonth: months[0] ? { ym: months[0].ym, label: months[0].label, count: months[0].count } : null,
    // 24 เดือนล่าสุด เรียงเก่า → ใหม่ (สำหรับกราฟ)
    months: months
      .slice(0, 24)
      .reverse()
      .map((m) => ({
        ym: m.ym,
        label: m.label,
        short: `${SHORT_TH[Number(m.ym.slice(5, 7)) - 1]} ${m.ym.slice(2, 4)}`,
        count: m.count,
      })),
    topProvinces: provinces.map((r) => ({ name: String(r.name), count: Number(r.n) })),
    topTsic: tsic.map((r) => ({ code: String(r.code), name: String(r.name ?? r.code).trim(), count: Number(r.n) })),
    types: typeRows.map(({ name, count }) => ({ name, count })),
    avgCapital: lastYearTotal ? typeRows.reduce((s, r) => s + r.cap * r.count, 0) / lastYearTotal : 0,
    lastYearTotal,
    contracts: Number(p.contracts ?? 0),
    contractValue: Number(p.value ?? 0),
    winners: Number(p.winners ?? 0),
    agencies: Number(p.agencies ?? 0),
    procurementProvinces: procProvinces.slice(0, 10).map((r) => ({ name: r.province, value: r.value, contracts: r.contracts })),
  };
}
