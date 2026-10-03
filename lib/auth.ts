/**
 * เข้าสู่ระบบด้วยลิงก์ทางอีเมล (ไม่มีรหัสผ่าน)
 *
 * - token / session เก็บเป็น SHA-256 ใน DB (ถ้า DB รั่ว ก็เอาไปใช้ไม่ได้)
 * - ลิงก์ในอีเมลเปิดหน้า "ยืนยันเข้าสู่ระบบ" แล้วต้องกดปุ่ม (POST) — กันโปรแกรมสแกนลิงก์ในอีเมลใช้ token ไปก่อน
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
import { completePending } from "@/lib/identity";
import { effectivePlan, isBillingEnabled } from "@/lib/billing";

export const SESSION_COOKIE = "tdc_session";
const SESSION_DAYS = 30;
const TOKEN_MINUTES = 30;

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

/** สร้าง token เข้าสู่ระบบ — คืน null ถ้าขอถี่เกิน (3 ครั้ง / 10 นาที / อีเมล) */
export async function createLoginToken(email: string, next: string, pendingHash: string | null = null): Promise<string | null> {
  const [recent] = await dbQuery<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM auth_token WHERE email = ? AND created_at > NOW() - INTERVAL 10 MINUTE`,
    [email],
  );
  if (Number(recent?.n ?? 0) >= 3) return null;
  const token = randomToken();
  await dbQuery(
    `INSERT INTO auth_token (token_hash, email, next_path, pending_hash, expires_at) VALUES (?, ?, ?, ?, NOW() + INTERVAL ? MINUTE)`,
    [sha256(token), email, next, pendingHash, TOKEN_MINUTES],
  );
  return token;
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
 * ใช้ token (ครั้งเดียว) → สร้างผู้ใช้ถ้ายังไม่มี + session — คืน path ปลายทาง หรือ null ถ้า token ใช้ไม่ได้
 * ถ้าลิงก์นี้มาจากการเข้าสู่ระบบด้วย Facebook ที่ไม่ได้ให้อีเมล จะเชื่อมบัญชี Facebook ให้ด้วย
 */
export async function consumeLoginToken(
  token: string,
): Promise<{ sessionToken: string; next: string; linked?: "ok" | "conflict" | "expired" } | null> {
  const hash = sha256(token);
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT email, next_path, pending_hash FROM auth_token WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
    [hash],
  );
  const t = rows[0];
  if (!t) return null;
  const res = await dbQuery<import("mysql2").ResultSetHeader>(
    `UPDATE auth_token SET used_at = NOW() WHERE token_hash = ? AND used_at IS NULL`,
    [hash],
  );
  if (res.affectedRows !== 1) return null; // ถูกใช้ไปพร้อมกันแล้ว

  await dbQuery(`INSERT INTO app_user (email) VALUES (?) ON DUPLICATE KEY UPDATE email = email`, [t.email]);
  const [u] = await dbQuery<RowDataPacket[]>(`SELECT id FROM app_user WHERE email = ?`, [t.email]);
  const linked = t.pending_hash ? await completePending(t.pending_hash, Number(u.id)) : undefined;
  const sessionToken = await createSessionForUser(Number(u.id));
  return { sessionToken, next: safeNext(t.next_path), linked };
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
    `SELECT u.id, u.email, u.plan, u.plan_expires_at, u.on_trial, u.trial_used_at,
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
  };
}

/** ต้อง login — ถ้ายังไม่ได้ login ส่งไปหน้า /login แล้วกลับมาที่ next */
export async function requireUser(next: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
