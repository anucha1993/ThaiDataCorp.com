/**
 * สมัคร / เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน (และ Google — ดู lib/identity.ts)
 *
 * - รหัสผ่านแฮชด้วย scrypt (lib/password.ts) · session เก็บเป็น SHA-256 ใน DB (ถ้า DB รั่ว ก็เอาไปใช้ไม่ได้)
 * - ใส่รหัสผ่านผิด 5 ครั้งใน 15 นาที → ล็อกบัญชีชั่วคราว 15 นาที
 * - อ่าน cookie เฉพาะหน้าที่ต้อง login (/account, /admin, /pay ...) เพื่อไม่ให้หน้า ISR กลายเป็น dynamic
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { FREE_PLAN_ID, getPlans, type Plan, type PlanId } from "@/lib/plans";
import { getSetting } from "@/lib/settings";
import { hashPassword, verifyPassword } from "@/lib/password";
import { effectivePlan, isBillingEnabled } from "@/lib/billing";

export const SESSION_COOKIE = "tdc_session";
const SESSION_DAYS = 30;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

export interface CurrentUser {
  id: number;
  email: string;
  /** แพ็กเกจที่ใช้ได้จริงตอนนี้ (หมดอายุแล้ว = free) */
  plan: Plan;
  /** แพ็กเกจที่ซื้อไว้ล่าสุด */
  purchasedPlan: PlanId;
  planExpiresAt: string | null;
  /** แพ็กเกจปัจจุบันเป็นช่วงทดลองใช้ฟรี */
  onTrial: boolean;
  /** เคยใช้สิทธิ์ทดลองแล้ว */
  trialUsed: boolean;
  isAdmin: boolean;
  /** ตั้งรหัสผ่านแล้ว (บัญชีที่สมัครด้วย Google อาจยังไม่มี) */
  hasPassword: boolean;
}

export function normalizeEmail(raw: unknown): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/.test(e) ? e : null;
}

/** path ภายในเว็บเท่านั้น — กัน open redirect */
export function safeNext(raw: unknown, fallback = "/account"): string {
  const s = String(raw ?? "");
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") ? s.slice(0, 255) : fallback;
}

/** ผู้ดูแล = ADMIN_EMAILS (env, เข้าได้เสมอ) + extra_admin_emails (ตั้งในหน้า /admin/settings) */
async function adminEmails(): Promise<Set<string>> {
  const extra = (await getSetting("extra_admin_emails")) ?? "";
  return new Set(
    `${process.env.ADMIN_EMAILS ?? ""},${extra}`.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

/** สร้าง session ใหม่ให้ผู้ใช้ — คืน token ดิบสำหรับใส่ cookie */
export async function createSessionForUser(userId: number): Promise<string> {
  const sessionToken = randomToken();
  await dbQuery(`INSERT INTO user_session (id_hash, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? DAY)`, [
    sha256(sessionToken),
    userId,
    SESSION_DAYS,
  ]);
  return sessionToken;
}

/**
 * สมัครสมาชิกด้วยอีเมล + รหัสผ่าน
 * - "exists"        อีเมลนี้มีรหัสผ่านอยู่แล้ว → ให้ไปเข้าสู่ระบบ
 * - "social-only"   อีเมลนี้สมัครด้วย Google → ต้องเข้าด้วย Google แล้วตั้งรหัสผ่านในหน้าบัญชี
 * - "no-password"   บัญชีเก่าจากระบบลิงก์อีเมล → ผู้ดูแลตั้งรหัสให้ (/admin/members หรือ npm run user:password)
 * ห้ามให้ "สมัครทับ" บัญชีที่มีอยู่แล้ว ไม่เช่นนั้นใครก็ตั้งรหัสผ่านให้บัญชีของคนอื่น (รวมถึงผู้ดูแล) แล้วเข้าแทนได้
 */
export async function registerWithPassword(
  email: string,
  password: string,
): Promise<{ userId: number } | { error: "exists" | "social-only" | "no-password" }> {
  const [u] = await dbQuery<RowDataPacket[]>(
    `SELECT id, password_hash, (SELECT COUNT(*) FROM user_identity i WHERE i.user_id = app_user.id) identities
     FROM app_user WHERE email = ?`,
    [email],
  );
  if (u) return { error: u.password_hash ? "exists" : Number(u.identities) > 0 ? "social-only" : "no-password" };
  try {
    const res = await dbQuery<import("mysql2").ResultSetHeader>(
      `INSERT INTO app_user (email, password_hash, password_set_at) VALUES (?, ?, NOW())`,
      [email, await hashPassword(password)],
    );
    return { userId: res.insertId };
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY") return { error: "exists" }; // สมัครพร้อมกัน 2 ครั้ง
    throw e;
  }
}

/** เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน */
export async function loginWithPassword(
  email: string,
  password: string,
): Promise<{ userId: number } | { error: "invalid" | "locked" | "no-password" | "social-only" }> {
  const [u] = await dbQuery<RowDataPacket[]>(
    `SELECT id, password_hash, failed_logins,
       (last_failed_login_at > NOW() - INTERVAL ? MINUTE) recent_fail,
       (SELECT COUNT(*) FROM user_identity i WHERE i.user_id = app_user.id) identities
     FROM app_user WHERE email = ?`,
    [LOCK_MINUTES, email],
  );
  if (u && Number(u.recent_fail) === 1 && Number(u.failed_logins) >= MAX_FAILED_LOGINS) return { error: "locked" };
  if (u && !u.password_hash) return { error: Number(u.identities) > 0 ? "social-only" : "no-password" };
  if (!(await verifyPassword(password, u?.password_hash))) {
    if (u) {
      await dbQuery(
        `UPDATE app_user SET failed_logins = IF(last_failed_login_at > NOW() - INTERVAL ? MINUTE, failed_logins + 1, 1),
           last_failed_login_at = NOW() WHERE id = ?`,
        [LOCK_MINUTES, u.id],
      );
    }
    return { error: "invalid" };
  }
  if (Number(u.failed_logins) > 0) await dbQuery(`UPDATE app_user SET failed_logins = 0 WHERE id = ?`, [u.id]);
  return { userId: Number(u.id) };
}

/** ตั้ง/เปลี่ยนรหัสผ่าน — ถ้ามีรหัสเดิมต้องใส่รหัสเดิมให้ถูก · admin ตั้งให้ได้โดยไม่ต้องใช้รหัสเดิม (current = null) */
export async function setUserPassword(
  userId: number,
  current: string | null,
  password: string,
): Promise<"ok" | "wrong-current"> {
  if (current !== null) {
    const [u] = await dbQuery<RowDataPacket[]>(`SELECT password_hash FROM app_user WHERE id = ?`, [userId]);
    if (u?.password_hash && !(await verifyPassword(current, u.password_hash))) return "wrong-current";
  }
  await dbQuery(`UPDATE app_user SET password_hash = ?, password_set_at = NOW(), failed_logins = 0 WHERE id = ?`, [
    await hashPassword(password),
    userId,
  ]);
  return "ok";
}

/** ใช้ใน Server Action / Route Handler เท่านั้น */
export async function setSessionCookie(sessionToken: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await dbQuery(`DELETE FROM user_session WHERE id_hash = ?`, [sha256(token)]);
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT u.id, u.email, u.plan, u.plan_expires_at, u.on_trial, u.trial_used_at, (u.password_hash IS NOT NULL) has_pw,
       (u.plan_expires_at IS NOT NULL AND u.plan_expires_at > NOW()) active
     FROM user_session s JOIN app_user u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > NOW()`,
    [sha256(token)],
  );
  const u = rows[0];
  if (!u) return null;
  const plans = await getPlans();
  const purchased: PlanId = plans[u.plan] ? u.plan : FREE_PLAN_ID;
  return {
    id: u.id,
    email: u.email,
    plan: await effectivePlan(plans, purchased, Number(u.active) === 1),
    purchasedPlan: purchased,
    planExpiresAt: u.plan_expires_at,
    onTrial: Number(u.on_trial) === 1 && Number(u.active) === 1 && (await isBillingEnabled()),
    trialUsed: Boolean(u.trial_used_at),
    isAdmin: (await adminEmails()).has(String(u.email).toLowerCase()),
    hasPassword: Number(u.has_pw) === 1,
  };
}

/** ต้อง login — ถ้ายังไม่ได้ login ส่งไปหน้า /login แล้วกลับมาที่ next */
export async function requireUser(next: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
