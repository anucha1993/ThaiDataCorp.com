/** เขียนข้อมูลลงตาราง juristic — ไม่ import "server-only" เพื่อให้สคริปต์ใช้ได้ */
import { dbQuery } from "@/lib/db";
import type { JuristicProfile } from "@/types/company";

/**
 * บันทึกข้อมูลที่ได้จาก DBD Open API — DBD เป็นข้อมูลทางการล่าสุด จึงเขียนทับข้อมูล Open-D
 * ยกเว้นวันจดทะเบียน/วันเลิกที่ DBD ไม่ส่งมา (เก็บของเดิมไว้)
 */
export async function upsertDbdProfile(p: JuristicProfile): Promise<void> {
  const a = p.address;
  const line = a.full.split(/\s+(?=แขวง|ตำบล|เขต|อำเภอ)/)[0];
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
}
