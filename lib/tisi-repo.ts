/** ใบอนุญาต มอก. ของนิติบุคคล — ตาราง juristic_tisi (sync ด้วย `npm run sync:tisi`) */
import "server-only";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export interface TisiLicense {
  licenseNo: string;
  issuedDate: string | null;
  licenseType: string | null;
  tisNo: string | null;
  tisName: string | null;
  factoryName: string | null;
  province: string | null;
}

export interface TisiInfo {
  /** นำเข้าข้อมูลแล้วหรือยัง (ยังไม่เคย sync → ไม่แสดงอะไร) */
  loaded: boolean;
  total: number;
  licenses: TisiLicense[];
  /** ไฟล์ต้นทางล่าสุด (YYYY-MM-DD) */
  sourceDate: string | null;
}

const MAX_SHOWN = 50;

export async function getTisiInfo(id: string): Promise<TisiInfo> {
  const [syncedAt, sourceDate] = await Promise.all([getSetting("tisi_synced_at"), getSetting("tisi_source_date")]);
  const empty: TisiInfo = { loaded: Boolean(syncedAt), total: 0, licenses: [], sourceDate: sourceDate || null };
  if (!syncedAt) return empty;
  const [rows, count] = await Promise.all([
    dbQuery<RowDataPacket[]>(
      `SELECT license_no, DATE_FORMAT(issued_date, '%Y-%m-%d') issued, license_type, tis_no, tis_name, factory_name, province
       FROM juristic_tisi WHERE tax_id = ? ORDER BY issued_date DESC, license_no LIMIT ${MAX_SHOWN}`,
      [id],
    ),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM juristic_tisi WHERE tax_id = ?`, [id]),
  ]);
  return {
    ...empty,
    total: Number(count[0]?.n ?? 0),
    licenses: rows.map((r) => ({
      licenseNo: r.license_no,
      issuedDate: r.issued ?? null,
      licenseType: r.license_type ?? null,
      tisNo: r.tis_no ?? null,
      tisName: r.tis_name ?? null,
      factoryName: r.factory_name ?? null,
      province: r.province ?? null,
    })),
  };
}
