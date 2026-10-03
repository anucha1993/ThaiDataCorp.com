/**
 * ทะเบียนภาษีมูลค่าเพิ่ม (กรมสรรพากร) — ข้อมูลจากตาราง juristic_vat ที่ sync ด้วย `npm run sync:vat`
 */
import "server-only";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export interface VatBranch {
  branchNo: number;
  name: string | null;
  address: string | null;
  province: string | null;
  approvedDate: string | null;
}

export interface VatInfo {
  /** ชุดข้อมูลถูกนำเข้าแล้วหรือยัง (ยังไม่เคย sync → ไม่แสดงอะไรเลย ไม่สรุปว่า "ไม่ได้จด VAT") */
  loaded: boolean;
  registered: boolean;
  /** วันที่ได้รับอนุมัติจด VAT ของสำนักงานใหญ่ (หรือสาขาแรกสุด) */
  since: string | null;
  totalBranches: number;
  /** สาขาที่แสดง (สำนักงานใหญ่ก่อน) */
  branches: VatBranch[];
  /** วันที่ของไฟล์ต้นทาง (YYYY-MM-DD) */
  sourceDate: string | null;
}

const MAX_BRANCHES_SHOWN = 100;

export async function getVatInfo(id: string): Promise<VatInfo> {
  const [syncedAt, sourceDate] = await Promise.all([getSetting("vat_synced_at"), getSetting("vat_source_date")]);
  const empty: VatInfo = { loaded: Boolean(syncedAt), registered: false, since: null, totalBranches: 0, branches: [], sourceDate: sourceDate || null };
  if (!syncedAt) return empty;

  const [rows, count] = await Promise.all([
    dbQuery<RowDataPacket[]>(
      `SELECT branch_no, branch_name, address, province, DATE_FORMAT(approved_date, '%Y-%m-%d') approved
       FROM juristic_vat WHERE tax_id = ? ORDER BY branch_no LIMIT ${MAX_BRANCHES_SHOWN}`,
      [id],
    ),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n, DATE_FORMAT(MIN(approved_date), '%Y-%m-%d') first FROM juristic_vat WHERE tax_id = ?`, [id]),
  ]);
  if (!rows.length) return empty;
  const hq = rows.find((r) => Number(r.branch_no) === 0);
  return {
    ...empty,
    registered: true,
    since: (hq?.approved as string | null) ?? (count[0]?.first as string | null) ?? null,
    totalBranches: Number(count[0]?.n ?? rows.length),
    branches: rows.map((r) => ({
      branchNo: Number(r.branch_no),
      name: r.branch_name ?? null,
      address: r.address ?? null,
      province: r.province ?? null,
      approvedDate: r.approved ?? null,
    })),
  };
}
