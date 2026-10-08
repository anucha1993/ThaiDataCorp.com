/**
 * โควตา DBD Open API — DBD จำกัดจำนวนครั้งต่อวัน (สังเกตได้ราว 2,000 ครั้ง/วัน เริ่มนับใหม่เที่ยงคืนเวลาไทย)
 * เกินแล้วตอบ error 8888 "Frequent API calls are exceeding the rate limit" ไปจนจบวัน
 *
 * - นับการเรียกทุกครั้งในตาราง dbd_api_usage (แยกงานเบื้องหลัง / หน้าเว็บ)
 * - งานเบื้องหลังใช้ได้ไม่เกิน DBD_JOB_DAILY_LIMIT เหลือโควตาไว้ให้หน้าเว็บ (บริษัทที่ยังไม่มีใน DB ต้องดึงตอนมีคนเปิด)
 * - เจอ 8888 → หยุดเรียกทั้งระบบจนเที่ยงคืน (ไม่ยิงซ้ำให้โดนบล็อกนานขึ้น)
 * ไม่ import "server-only" เพื่อให้สคริปต์ใช้ได้
 */
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";

export const DBD_DAILY_LIMIT = Number(process.env.DBD_DAILY_LIMIT) || 1900;
export const DBD_JOB_DAILY_LIMIT = Number(process.env.DBD_JOB_DAILY_LIMIT) || 1300;

export type DbdPurpose = "job" | "web";

/** วันที่ตามเวลาไทย (โควตา DBD เริ่มนับใหม่เที่ยงคืนไทย) */
const thaiDay = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

// cache สถานะในหน่วยความจำ 60 วินาที (หน้าเว็บไม่ต้อง query ทุกครั้ง)
const g = globalThis as unknown as { __tdcDbdQuota?: { at: number; day: string; used: number; jobUsed: number; blocked: boolean } };

async function state(force = false) {
  const day = thaiDay();
  const c = g.__tdcDbdQuota;
  if (!force && c && c.day === day && Date.now() - c.at < 60_000) return c;
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT used, job_used, blocked FROM dbd_api_usage WHERE day = ?`, [day]);
  const s = { at: Date.now(), day, used: Number(r?.used ?? 0), jobUsed: Number(r?.job_used ?? 0), blocked: Number(r?.blocked ?? 0) === 1 };
  g.__tdcDbdQuota = s;
  return s;
}

/** เหลือให้เรียกได้อีกกี่ครั้งวันนี้ (0 = งด) */
export async function dbdRemaining(purpose: DbdPurpose): Promise<number> {
  const s = await state(purpose === "job");
  if (s.blocked) return 0;
  const total = Math.max(0, DBD_DAILY_LIMIT - s.used);
  return purpose === "job" ? Math.min(total, Math.max(0, DBD_JOB_DAILY_LIMIT - s.jobUsed)) : total;
}

export async function recordDbdCall(purpose: DbdPurpose): Promise<void> {
  const job = purpose === "job" ? 1 : 0;
  await dbQuery(
    `INSERT INTO dbd_api_usage (day, used, job_used) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE used = used + 1, job_used = job_used + ?`,
    [thaiDay(), job, job],
  );
  const c = g.__tdcDbdQuota;
  if (c && c.day === thaiDay()) {
    c.used++;
    c.jobUsed += job;
  }
}

/** DBD ตอบว่าเกินโควตา → งดทั้งวัน */
export async function markDbdBlocked(): Promise<void> {
  await dbQuery(`INSERT INTO dbd_api_usage (day, used, job_used, blocked) VALUES (?, 0, 0, 1) ON DUPLICATE KEY UPDATE blocked = 1`, [thaiDay()]);
  if (g.__tdcDbdQuota) g.__tdcDbdQuota.blocked = true;
}
