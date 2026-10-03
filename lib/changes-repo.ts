/**
 * ความเคลื่อนไหวนิติบุคคล — การเปลี่ยนแปลงที่ตรวจพบเมื่ออัปเดตข้อมูลกับ DBD Open API (ตาราง juristic_change)
 * วันที่เป็น "วันที่ตรวจพบ" ไม่ใช่วันที่จดทะเบียนเปลี่ยนแปลงจริง (DBD Open API ไม่ส่งวันที่แก้ไข)
 */
import "server-only";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import type { ChangeField } from "@/lib/juristic-write";

export type { ChangeField };

export const CHANGE_LABELS: Record<ChangeField, string> = {
  name: "เปลี่ยนชื่อ",
  capital: "เปลี่ยนทุนจดทะเบียน",
  status: "เปลี่ยนสถานะ",
  tsic: "เปลี่ยนประเภทธุรกิจ",
  address: "ย้ายที่ตั้ง",
  type: "เปลี่ยนประเภทนิติบุคคล",
};
export const CHANGE_FIELDS = Object.keys(CHANGE_LABELS) as ChangeField[];
export const isChangeField = (v: unknown): v is ChangeField => typeof v === "string" && v in CHANGE_LABELS;

export interface JuristicChange {
  id: number;
  juristicId: string;
  /** ชื่อปัจจุบันของนิติบุคคล */
  name: string;
  province: string | null;
  field: ChangeField;
  oldValue: string | null;
  newValue: string | null;
  /** ISO timestamp ที่ตรวจพบ */
  detectedAt: string;
}

const PAGE_SIZE = 50;

const toChange = (r: RowDataPacket): JuristicChange => ({
  id: Number(r.id),
  juristicId: r.juristic_id,
  name: r.name_th ?? r.juristic_id,
  province: r.province ?? null,
  field: r.field,
  oldValue: r.old_value,
  newValue: r.new_value,
  detectedAt: new Date(r.detected_at).toISOString(),
});

const SELECT = `SELECT c.id, c.juristic_id, c.field, c.old_value, c.new_value, c.detected_at, j.name_th, j.province
  FROM juristic_change c LEFT JOIN juristic j ON j.id = c.juristic_id`;

/** ฟีดล่าสุด (กรองตามประเภท/จังหวัด) */
export async function listChanges(opts: { field?: ChangeField; province?: string; page?: number }) {
  const where = ["1=1"];
  const params: unknown[] = [];
  if (opts.field) (where.push("c.field = ?"), params.push(opts.field));
  if (opts.province) (where.push("j.province = ?"), params.push(opts.province));
  const page = Math.max(1, opts.page ?? 1);
  const rows = await dbQuery<RowDataPacket[]>(
    `${SELECT} WHERE ${where.join(" AND ")} ORDER BY c.detected_at DESC, c.id DESC LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}`,
    params,
  );
  return { items: rows.slice(0, PAGE_SIZE).map(toChange), hasNext: rows.length > PAGE_SIZE, page };
}

/** จำนวนแยกประเภทในช่วง N วัน */
export async function countChanges(days: number): Promise<Record<ChangeField, number> & { total: number }> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT field, COUNT(*) n FROM juristic_change WHERE detected_at >= NOW() - INTERVAL ? DAY GROUP BY field`,
    [days],
  );
  const out = Object.fromEntries(CHANGE_FIELDS.map((f) => [f, 0])) as Record<ChangeField, number>;
  for (const r of rows) if (isChangeField(r.field)) out[r.field] = Number(r.n);
  return { ...out, total: rows.reduce((n, r) => n + Number(r.n), 0) };
}

/** ประวัติของนิติบุคคล 1 ราย */
export async function listCompanyChanges(id: string, limit = 50): Promise<JuristicChange[]> {
  const rows = await dbQuery<RowDataPacket[]>(`${SELECT} WHERE c.juristic_id = ? ORDER BY c.detected_at DESC, c.id DESC LIMIT ${limit}`, [id]);
  return rows.map(toChange);
}
