/**
 * การตั้งค่าที่แก้ได้จากหน้า /admin/settings (ตาราง app_setting)
 * ถ้าใน DB ยังไม่มีค่า จะใช้ค่าจาก environment variable ที่กำหนดใน SETTINGS เป็นค่าสำรอง
 * (ค่าลับ เช่น รหัสผ่าน SMTP ยังเก็บใน env เท่านั้น ไม่เก็บใน DB)
 */
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";

export interface SettingDef {
  key: string;
  label: string;
  help: string;
  env?: string;
  /** text (ค่าเริ่มต้น) | toggle (เปิด/ปิด → "1"/"0") | plan (เลือกแพ็กเกจ) */
  type?: "text" | "toggle" | "plan";
}

export const SETTINGS: SettingDef[] = [
  {
    key: "billing_enabled",
    label: "เปิดการเก็บเงิน",
    help: "ปิด = สมาชิกทุกคนใช้งานเต็มรูปแบบฟรี (ซ่อนหน้าราคา/ชำระเงิน/ทดลองใช้) · เปิด = ใช้แพ็กเกจและราคาตาม /admin/plans",
    type: "toggle",
  },
  {
    key: "free_mode_plan",
    label: "สิทธิ์ของสมาชิกระหว่างปิดการเก็บเงิน",
    help: "สมาชิกทุกคนจะได้โควตาและฟีเจอร์ตามแพ็กเกจนี้ (ปรับตัวเลขได้ที่หน้าแพ็กเกจ)",
    type: "plan",
  },
  { key: "promptpay_id", label: "PromptPay ที่รับเงิน", help: "เบอร์มือถือ 10 หลัก หรือเลขนิติบุคคล/ผู้เสียภาษี 13 หลัก", env: "PROMPTPAY_ID" },
  { key: "promptpay_name", label: "ชื่อบัญชี PromptPay", help: "ชื่อที่ลูกค้าเห็นในหน้าชำระเงิน", env: "PROMPTPAY_NAME" },
  { key: "support_email", label: "อีเมลติดต่อ/ร้องเรียน", help: "แสดงทั้งเว็บ และรับแจ้งเตือนคำร้องใหม่ (ว่าง = info@thaidatacorp.com)", env: "SUPPORT_EMAIL" },
  { key: "extra_admin_emails", label: "ผู้ดูแลเพิ่มเติม", help: "อีเมลคั่นด้วย , (ผู้ดูแลใน ADMIN_EMAILS ของ env เข้าได้เสมอ)" },
];

const CACHE_MS = 30_000;
const g = globalThis as unknown as { __tdcSettings?: { at: number; map: Map<string, string> } };

async function load(): Promise<Map<string, string>> {
  if (g.__tdcSettings && Date.now() - g.__tdcSettings.at < CACHE_MS) return g.__tdcSettings.map;
  try {
    const rows = await dbQuery<RowDataPacket[]>(`SELECT k, v FROM app_setting`);
    const map = new Map(rows.filter((r) => r.v !== null && r.v !== "").map((r) => [r.k as string, String(r.v)]));
    g.__tdcSettings = { at: Date.now(), map };
    return map;
  } catch {
    return new Map();
  }
}

export async function getSetting(key: string): Promise<string | undefined> {
  const v = (await load()).get(key);
  if (v) return v;
  const env = SETTINGS.find((s) => s.key === key)?.env;
  return env ? process.env[env]?.trim() || undefined : undefined;
}

export async function setSettings(values: Record<string, string>): Promise<void> {
  for (const s of SETTINGS) {
    if (!(s.key in values)) continue;
    await dbQuery(`INSERT INTO app_setting (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)`, [
      s.key,
      values[s.key].trim().slice(0, 1000),
    ]);
  }
  g.__tdcSettings = undefined;
}

export const DEFAULT_SUPPORT_EMAIL = "info@thaidatacorp.com";

/** อีเมลติดต่อ/ร้องเรียนที่แสดงบนเว็บ และรับแจ้งเตือนคำร้องใหม่ */
export async function getSupportEmail(): Promise<string> {
  return (await getSetting("support_email")) || DEFAULT_SUPPORT_EMAIL;
}
