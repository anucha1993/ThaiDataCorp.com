import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";

/** ชื่อหมวด TSIC (ทุกระดับ) — null ถ้าไม่พบ */
export async function getTsicName(code: string): Promise<string | null> {
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT name_th FROM tsic WHERE code = ? LIMIT 1`, [code]);
  return r?.name_th ? String(r.name_th).trim() : null;
}
