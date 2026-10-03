/**
 * งานจัดซื้อจัดจ้างภาครัฐ (e-GP) ของแต่ละบริษัท — อ่านจาก procurement_contract / procurement_summary
 */
import "server-only";
import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import type { ProcurementContract, ProcurementSummary } from "@/types/company";

export const getProcurementForCompany = cache(async (id: string): Promise<ProcurementSummary | null> => {
  const [summary] = await dbQuery<RowDataPacket[]>(`SELECT * FROM procurement_summary WHERE winner_id = ?`, [id]);
  if (!summary) return null;

  const [agencies, latest, years] = await Promise.all([
    dbQuery<RowDataPacket[]>(
      `SELECT agency, COUNT(*) n, SUM(COALESCE(contract_value, agreed_price, 0)) v
       FROM procurement_contract WHERE winner_id = ? GROUP BY agency ORDER BY v DESC LIMIT 5`,
      [id],
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT fiscal_year, seq, project_name, project_type, agency, method, province, sign_date, end_date,
         contract_value, agreed_price, ref_price, contract_status
       FROM procurement_contract WHERE winner_id = ? ORDER BY sign_date DESC, seq DESC LIMIT 20`,
      [id],
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT DISTINCT fiscal_year FROM procurement_contract WHERE winner_id = ? ORDER BY fiscal_year`,
      [id],
    ),
  ]);

  return {
    contracts: Number(summary.contracts),
    totalValue: Number(summary.total_value),
    agencies: Number(summary.agencies),
    firstSign: summary.first_sign,
    lastSign: summary.last_sign,
    fiscalYears: years.map((y) => Number(y.fiscal_year)),
    topAgencies: agencies.map((a) => ({ agency: a.agency ?? "-", contracts: Number(a.n), value: Number(a.v) })),
    latest: latest.map(
      (c): ProcurementContract => ({
        fiscalYear: c.fiscal_year,
        projectName: c.project_name,
        projectType: c.project_type ?? undefined,
        agency: c.agency ?? "-",
        method: c.method ?? undefined,
        province: c.province ?? undefined,
        signDate: c.sign_date,
        endDate: c.end_date,
        value: c.contract_value ?? c.agreed_price ?? 0,
        refPrice: c.ref_price ?? undefined,
        status: c.contract_status ?? undefined,
      }),
    ),
  };
});

/* -------------------------------------------------------------------------- */
/*                         หน่วยงานรัฐ / จัดอันดับ / ข้อสังเกต                     */
/* -------------------------------------------------------------------------- */

export interface WinnerRank {
  id: string;
  name: string;
  contracts: number;
  value: number;
  /** มีหน้าบริษัทใน DB แล้วหรือยัง (ถ้ายัง ลิงก์ไปแล้วระบบจะดึงจาก DBD ให้) */
  inDb: boolean;
}

export interface AgencySummary {
  agency: string;
  contracts: number;
  totalValue: number;
  winners: number;
  ebidContracts: number;
  topProvince: string | null;
}

const VALUE = `COALESCE(contract_value, agreed_price, 0)`;

/** ชื่อผู้ชนะ: ใช้ชื่อจากทะเบียน (juristic) ก่อน ถ้าไม่มีใช้ชื่อในสัญญา */
async function attachNames(rows: RowDataPacket[]): Promise<WinnerRank[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.winner_id as string);
  const [reg, fromContracts] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT id, name_th FROM juristic WHERE id IN (?)`, [ids]),
    dbQuery<RowDataPacket[]>(`SELECT winner_id, winner_name name FROM procurement_summary WHERE winner_id IN (?)`, [ids]),
  ]);
  const regName = new Map(reg.map((r) => [r.id as string, r.name_th as string]));
  const cName = new Map(fromContracts.map((r) => [r.winner_id as string, r.name as string]));
  return rows.map((r) => ({
    id: r.winner_id,
    name: regName.get(r.winner_id) ?? cName.get(r.winner_id) ?? r.winner_id,
    contracts: Number(r.contracts),
    value: Number(r.total_value),
    inDb: regName.has(r.winner_id),
  }));
}

export const getAgency = cache(async (agency: string): Promise<AgencySummary | null> => {
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT * FROM procurement_agency_summary WHERE agency = ?`, [agency]);
  return r
    ? {
        agency: r.agency,
        contracts: Number(r.contracts),
        totalValue: Number(r.total_value),
        winners: Number(r.winners),
        ebidContracts: Number(r.ebid_contracts),
        topProvince: r.top_province,
      }
    : null;
});

export async function getAgencyTopWinners(agency: string, limit = 50): Promise<WinnerRank[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT winner_id, COUNT(*) contracts, SUM(${VALUE}) total_value FROM procurement_contract
     WHERE agency = ? GROUP BY winner_id ORDER BY total_value DESC LIMIT ?`,
    [agency, limit],
  );
  return attachNames(rows);
}

export async function getAgencyMethods(agency: string): Promise<Array<{ method: string; contracts: number; value: number }>> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT COALESCE(method, 'ไม่ระบุ') method, COUNT(*) n, SUM(${VALUE}) v FROM procurement_contract
     WHERE agency = ? GROUP BY method ORDER BY v DESC`,
    [agency],
  );
  return rows.map((r) => ({ method: r.method, contracts: Number(r.n), value: Number(r.v) }));
}

export async function getAgencyLatest(agency: string, limit = 50) {
  return dbQuery<RowDataPacket[]>(
    `SELECT c.winner_id, c.winner_name, c.project_name, c.method, c.province, c.sign_date, c.contract_status,
       ${VALUE} AS value FROM procurement_contract c WHERE c.agency = ? ORDER BY c.sign_date DESC, c.seq DESC LIMIT ?`,
    [agency, limit],
  );
}

export const listTopAgencies = cache(async (limit = 500): Promise<AgencySummary[]> => {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT * FROM procurement_agency_summary ORDER BY total_value DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    agency: r.agency,
    contracts: Number(r.contracts),
    totalValue: Number(r.total_value),
    winners: Number(r.winners),
    ebidContracts: Number(r.ebid_contracts),
    topProvince: r.top_province,
  }));
});

/** อันดับบริษัทที่ได้งานภาครัฐมากที่สุด (ทั่วประเทศ หรือตามจังหวัดที่ตั้งโครงการ) */
export const getTopWinners = cache(async (province?: string, limit = 100): Promise<WinnerRank[]> => {
  const rows = province
    ? await dbQuery<RowDataPacket[]>(
        `SELECT winner_id, contracts, total_value FROM procurement_province_winner
         WHERE province = ? ORDER BY total_value DESC LIMIT ?`,
        [province, limit],
      )
    : await dbQuery<RowDataPacket[]>(
        `SELECT winner_id, contracts, total_value FROM procurement_summary ORDER BY total_value DESC LIMIT ?`,
        [limit],
      );
  return attachNames(rows);
});

export const listProcurementProvinces = cache(
  async (): Promise<Array<{ province: string; contracts: number; value: number; winners: number }>> => {
    const rows = await dbQuery<RowDataPacket[]>(
      `SELECT province, SUM(contracts) n, SUM(total_value) v, COUNT(*) w FROM procurement_province_winner
       GROUP BY province ORDER BY v DESC`,
    );
    return rows.map((r) => ({ province: r.province, contracts: Number(r.n), value: Number(r.v), winners: Number(r.w) }));
  },
);

export async function listAgencySitemapNames(minContracts = 20): Promise<string[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT agency FROM procurement_agency_summary WHERE contracts >= ? ORDER BY total_value DESC LIMIT 45000`,
    [minContracts],
  );
  return rows.map((r) => r.agency as string);
}

/** สัญญาวิธีประกวดราคา/e-bidding ที่ราคาตกลงเท่ากับราคากลางพอดี */
export async function getPriceEqualsReference(id: string): Promise<{ competitive: number; equal: number }> {
  const [r] = await dbQuery<RowDataPacket[]>(
    `SELECT COUNT(*) competitive, COALESCE(SUM(agreed_price = ref_price), 0) equal FROM procurement_contract
     WHERE winner_id = ? AND ref_price > 0 AND agreed_price IS NOT NULL
       AND (method LIKE '%e-bidding%' OR method LIKE '%ประกวดราคา%')`,
    [id],
  );
  return { competitive: Number(r?.competitive ?? 0), equal: Number(r?.equal ?? 0) };
}
