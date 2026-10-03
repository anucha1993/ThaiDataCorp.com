/** เขียนข้อมูลลงตาราง juristic — ไม่ import "server-only" เพื่อให้สคริปต์ใช้ได้ */
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import type { JuristicProfile } from "@/types/company";

/** ประเภทการเปลี่ยนแปลงที่บันทึกในตาราง juristic_change */
export type ChangeField = "name" | "capital" | "tsic" | "type" | "status" | "address";

const ACTIVE_TEXT = "ยังดำเนินกิจการอยู่";
/** เทียบข้อความโดยไม่สนช่องว่าง (ข้อมูล Open-D กับ DBD เว้นวรรคต่างกัน) */
const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, "");

/**
 * บันทึกข้อมูลที่ได้จาก DBD Open API — DBD เป็นข้อมูลทางการล่าสุด จึงเขียนทับข้อมูล Open-D
 * ยกเว้นวันจดทะเบียน/วันเลิกที่ DBD ไม่ส่งมา (เก็บของเดิมไว้)
 * ถ้ามีข้อมูลเดิมอยู่แล้ว จะบันทึกสิ่งที่เปลี่ยน (ชื่อ ทุน ประเภทธุรกิจ สถานะ ที่ตั้ง) ลง juristic_change
 */
export async function upsertDbdProfile(p: JuristicProfile): Promise<void> {
  const a = p.address;
  const line = a.full.split(/\s+(?=แขวง|ตำบล|เขต|อำเภอ)/)[0];
  const [old] = await dbQuery<RowDataPacket[]>(
    `SELECT name_th, register_capital, tsic_code, juristic_type, status_text, address_line, province, dissolved_date, dbd_fetched_at
     FROM juristic WHERE id = ?`,
    [p.id],
  );
  await dbQuery(
    `INSERT INTO juristic (id, name_th, name_raw, name_en, juristic_type, status_text, register_date, register_capital,
       tsic_code, objective, address_line, sub_district, district, province, post_code, source, dbd_fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dbd', NOW())
     ON DUPLICATE KEY UPDATE
       name_th = VALUES(name_th), name_en = VALUES(name_en), juristic_type = VALUES(juristic_type),
       status_text = VALUES(status_text), register_date = COALESCE(VALUES(register_date), register_date),
       register_capital = VALUES(register_capital), tsic_code = COALESCE(VALUES(tsic_code), tsic_code),
       objective = COALESCE(VALUES(objective), objective), address_line = VALUES(address_line),
       sub_district = VALUES(sub_district), district = VALUES(district), province = VALUES(province),
       post_code = COALESCE(VALUES(post_code), post_code), dbd_fetched_at = NOW()`,
    [
      p.id, p.nameTh, p.nameTh, p.nameEn ?? null, p.type, p.statusText, p.registerDate, p.registerCapital,
      p.tsic?.code ?? null, p.tsic?.description ?? null, line || null,
      a.subDistrict ?? null, a.district ?? null, a.province ?? null, a.postCode ?? null,
    ],
  );
  if (old) await recordChanges(p.id, old, p, line).catch((e) => console.error(`[juristic] record changes ${p.id} failed:`, e));
}

async function recordChanges(id: string, old: RowDataPacket, p: JuristicProfile, line: string): Promise<void> {
  const changes: Array<[ChangeField, string | null, string | null]> = [];
  if (p.nameTh && norm(old.name_th) !== norm(p.nameTh)) changes.push(["name", old.name_th, p.nameTh]);
  if (Number(old.register_capital) !== Number(p.registerCapital) && p.registerCapital > 0) {
    changes.push(["capital", String(Number(old.register_capital)), String(p.registerCapital)]);
  }
  if (p.tsic?.code && old.tsic_code && old.tsic_code !== p.tsic.code) changes.push(["tsic", old.tsic_code, p.tsic.code]);
  if (p.type && old.juristic_type && norm(old.juristic_type) !== norm(p.type)) changes.push(["type", old.juristic_type, p.type]);

  // สถานะ: Open-D ไม่มีข้อความสถานะ — ถือว่า "ยังดำเนินกิจการอยู่" ถ้ายังไม่มีวันเลิก
  const oldStatus = old.status_text ?? (old.dissolved_date ? null : ACTIVE_TEXT);
  if (oldStatus && p.statusText && oldStatus !== p.statusText) changes.push(["status", oldStatus, p.statusText]);

  // ที่ตั้ง: ข้อมูล Open-D เขียนที่อยู่ต่างรูปแบบกับ DBD — ครั้งแรกที่ตรวจกับ DBD นับเฉพาะเมื่อย้ายจังหวัด
  const newAddr = [line, p.address.province].filter(Boolean).join(" ");
  const oldAddr = [old.address_line, old.province].filter(Boolean).join(" ");
  const moved = old.dbd_fetched_at ? norm(oldAddr) !== norm(newAddr) : Boolean(old.province && p.address.province && old.province !== p.address.province);
  if (moved && newAddr) changes.push(["address", oldAddr || null, newAddr]);

  if (!changes.length) return;
  await dbQuery(`INSERT INTO juristic_change (juristic_id, field, old_value, new_value, detected_at) VALUES ?`, [
    changes.map(([field, from, to]) => [id, field, from?.slice(0, 600) ?? null, to?.slice(0, 600) ?? null, new Date()]),
  ]);
}
