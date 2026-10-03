/**
 * บัญชีจากผู้ให้บริการภายนอก (Facebook) ↔ บัญชีสมาชิก (app_user)
 *
 * กติกาการเชื่อมบัญชี:
 *   1. เคยเชื่อม provider+uid นี้แล้ว → เข้าบัญชีเดิม
 *   2. ผู้ให้บริการส่งอีเมลมา (Facebook ส่งเฉพาะอีเมลที่ยืนยันแล้ว)
 *      - ยังไม่มีบัญชี / บัญชีนั้นไม่มีรหัสผ่าน → เข้าบัญชีที่ใช้อีเมลนั้น (สร้างใหม่ถ้ายังไม่มี) แล้วเชื่อม
 *      - บัญชีนั้นมีรหัสผ่าน → ต้องกรอกรหัสผ่านก่อนเชื่อม (oauth_pending) — อีเมลของบัญชีรหัสผ่านไม่ได้ยืนยัน
 *        ถ้าเชื่อมอัตโนมัติ คนที่สมัครดักอีเมลของคนอื่นไว้ก่อนจะได้บัญชีของเจ้าของจริงไป
 *   3. ไม่มีอีเมล → ให้ผู้ใช้เข้าสู่ระบบหรือสมัครด้วยอีเมล + รหัสผ่านก่อน แล้วจึงเชื่อม (oauth_pending)
 *
 * (ไม่ import "server-only" เพื่อให้ทดสอบด้วยสคริปต์ได้)
 */
import { createHash, randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";

export type Provider = "facebook";

export interface ExternalProfile {
  provider: Provider;
  uid: string;
  email?: string | null;
  name?: string | null;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function findUserIdByIdentity(provider: Provider, uid: string): Promise<number | null> {
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT user_id FROM user_identity WHERE provider = ? AND provider_uid = ?`, [
    provider,
    uid,
  ]);
  return r ? Number(r.user_id) : null;
}

/** เชื่อมบัญชีภายนอกเข้ากับผู้ใช้ — "conflict" ถ้าบัญชีภายนอกนี้ถูกเชื่อมกับผู้ใช้คนอื่นอยู่แล้ว */
export async function linkIdentity(userId: number, p: ExternalProfile): Promise<"ok" | "conflict"> {
  const existing = await findUserIdByIdentity(p.provider, p.uid);
  if (existing !== null && existing !== userId) return "conflict";
  await dbQuery(
    `INSERT INTO user_identity (provider, provider_uid, user_id, email, name) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name)`,
    [p.provider, p.uid, userId, p.email ?? null, p.name ?? null],
  );
  if (p.name) await dbQuery(`UPDATE app_user SET display_name = COALESCE(display_name, ?) WHERE id = ?`, [p.name, userId]);
  return "ok";
}

export async function unlinkIdentity(userId: number, provider: Provider): Promise<void> {
  await dbQuery(`DELETE FROM user_identity WHERE user_id = ? AND provider = ?`, [userId, provider]);
}

export async function listIdentities(userId: number): Promise<Array<{ provider: Provider; name: string | null; email: string | null }>> {
  const rows = await dbQuery<RowDataPacket[]>(`SELECT provider, name, email FROM user_identity WHERE user_id = ?`, [userId]);
  return rows.map((r) => ({ provider: r.provider, name: r.name, email: r.email }));
}

async function createPending(p: ExternalProfile, email: string | null): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await dbQuery(
    `INSERT INTO oauth_pending (token_hash, provider, provider_uid, name, email, expires_at)
     VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL 30 MINUTE)`,
    [sha256(token), p.provider, p.uid, p.name ?? null, email],
  );
  return token;
}

/**
 * เข้าสู่ระบบด้วยบัญชีภายนอก
 * - { userId } เมื่อเข้าได้ทันที
 * - { pendingToken, email } เมื่อต้องให้ผู้ใช้เข้าสู่ระบบด้วยรหัสผ่านก่อน (email = บัญชีที่ต้องกรอกรหัส, null = ไม่รู้อีเมล)
 */
export async function loginWithExternal(
  p: ExternalProfile,
): Promise<{ userId: number } | { pendingToken: string; email: string | null }> {
  const linked = await findUserIdByIdentity(p.provider, p.uid);
  if (linked !== null) return { userId: linked };

  const email = p.email?.trim().toLowerCase();
  if (!email) return { pendingToken: await createPending(p, null), email: null };

  const [u] = await dbQuery<RowDataPacket[]>(`SELECT id, password_hash FROM app_user WHERE email = ?`, [email]);
  if (u?.password_hash) return { pendingToken: await createPending(p, email), email };
  let userId = u ? Number(u.id) : 0;
  if (!userId) {
    await dbQuery(`INSERT INTO app_user (email) VALUES (?) ON DUPLICATE KEY UPDATE email = email`, [email]);
    const [n] = await dbQuery<RowDataPacket[]>(`SELECT id FROM app_user WHERE email = ?`, [email]);
    userId = Number(n.id);
  }
  await linkIdentity(userId, p);
  return { userId };
}

/** hash ของ pending token (ส่งต่อในฟอร์มเข้าสู่ระบบ/สมัคร) — null ถ้าไม่ถูกต้อง/หมดอายุ */
export async function pendingHash(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const h = sha256(token);
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT 1 FROM oauth_pending WHERE token_hash = ? AND expires_at > NOW()`, [h]);
  return r ? h : null;
}

/** ผู้ใช้เข้าสู่ระบบ/สมัครด้วยรหัสผ่านแล้ว → เชื่อมบัญชีภายนอกที่รออยู่ */
export async function completePending(hash: string, userId: number): Promise<"ok" | "conflict" | "expired"> {
  const [r] = await dbQuery<RowDataPacket[]>(
    `SELECT provider, provider_uid, name FROM oauth_pending WHERE token_hash = ? AND expires_at > NOW()`,
    [hash],
  );
  if (!r) return "expired";
  const res = await linkIdentity(userId, { provider: r.provider, uid: r.provider_uid, name: r.name });
  await dbQuery<ResultSetHeader>(`DELETE FROM oauth_pending WHERE token_hash = ?`, [hash]);
  return res;
}
