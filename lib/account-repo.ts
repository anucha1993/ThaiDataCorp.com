/** ข้อมูลของสมาชิก: รายการที่ติดตาม / เงื่อนไขแจ้งเตือน / คำสั่งซื้อ */
import "server-only";
import { randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import type { Plan, PlanId } from "@/lib/plans";

export type WatchKind = "company" | "agency";

export interface WatchItem {
  kind: WatchKind;
  target: string;
  /** ชื่อที่ใช้แสดง (ชื่อบริษัทจาก DB หรือชื่อหน่วยงาน) */
  label: string;
  createdAt: string;
}

export async function listWatches(userId: number): Promise<WatchItem[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT w.kind, w.target, w.created_at, COALESCE(j.name_th, s.winner_name) company_name
     FROM user_watch w
     LEFT JOIN juristic j ON w.kind = 'company' AND j.id = w.target
     LEFT JOIN procurement_summary s ON w.kind = 'company' AND s.winner_id = w.target
     WHERE w.user_id = ? ORDER BY w.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    kind: r.kind,
    target: r.target,
    label: r.kind === "company" ? (r.company_name ?? r.target) : r.target,
    createdAt: String(r.created_at),
  }));
}

/** เพิ่มรายการติดตาม — คืน "limit" ถ้าเกินโควตาของแพ็กเกจ */
export async function addWatch(userId: number, plan: Plan, kind: WatchKind, target: string): Promise<"ok" | "limit"> {
  const [c] = await dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM user_watch WHERE user_id = ?`, [userId]);
  const [exists] = await dbQuery<RowDataPacket[]>(
    `SELECT 1 FROM user_watch WHERE user_id = ? AND kind = ? AND target = ?`,
    [userId, kind, target],
  );
  if (exists) return "ok";
  if (Number(c?.n ?? 0) >= plan.maxWatches) return "limit";
  await dbQuery(`INSERT IGNORE INTO user_watch (user_id, kind, target) VALUES (?, ?, ?)`, [userId, kind, target]);
  return "ok";
}

export async function removeWatch(userId: number, kind: WatchKind, target: string): Promise<void> {
  await dbQuery(`DELETE FROM user_watch WHERE user_id = ? AND kind = ? AND target = ?`, [userId, kind, target]);
}

export interface SavedSearch {
  id: number;
  tsicCode: string | null;
  tsicName: string | null;
  province: string | null;
}

export async function listSavedSearches(userId: number): Promise<SavedSearch[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT s.id, s.tsic_code, t.name_th, s.province FROM saved_search s LEFT JOIN tsic t ON t.code = s.tsic_code
     WHERE s.user_id = ? ORDER BY s.id`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, tsicCode: r.tsic_code, tsicName: r.name_th?.trim() ?? null, province: r.province }));
}

export async function addSavedSearch(
  userId: number,
  plan: Plan,
  tsic: string | null,
  province: string | null,
): Promise<"ok" | "limit" | "invalid"> {
  if (!tsic && !province) return "invalid";
  if (tsic) {
    const [t] = await dbQuery<RowDataPacket[]>(`SELECT 1 FROM tsic WHERE code = ? AND level = 5`, [tsic]);
    if (!t) return "invalid";
  }
  const [c] = await dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM saved_search WHERE user_id = ?`, [userId]);
  if (Number(c?.n ?? 0) >= plan.maxSavedSearches) return "limit";
  await dbQuery(`INSERT INTO saved_search (user_id, tsic_code, province) VALUES (?, ?, ?)`, [userId, tsic, province]);
  return "ok";
}

export async function removeSavedSearch(userId: number, id: number): Promise<void> {
  await dbQuery(`DELETE FROM saved_search WHERE id = ? AND user_id = ?`, [id, userId]);
}

/* ------------------------------- ทดลองใช้ฟรี ------------------------------- */

/**
 * เริ่มทดลองใช้แพ็กเกจ — ได้ครั้งเดียวต่อบัญชี และต้องไม่มีแพ็กเกจเสียเงินที่ยังใช้งานอยู่
 * (เงื่อนไขอยู่ใน WHERE เดียวกัน กันกดซ้ำพร้อมกัน)
 */
export async function startTrial(userId: number, plan: Plan): Promise<"ok" | "used" | "active" | "unavailable"> {
  if (plan.trialDays <= 0 || plan.price <= 0 || !plan.active) return "unavailable";
  const [u] = await dbQuery<RowDataPacket[]>(
    `SELECT trial_used_at, (plan <> 'free' AND plan_expires_at > NOW()) paid_active FROM app_user WHERE id = ?`,
    [userId],
  );
  if (!u) return "unavailable";
  if (u.trial_used_at) return "used";
  if (Number(u.paid_active) === 1) return "active";
  const res = await dbQuery<import("mysql2").ResultSetHeader>(
    `UPDATE app_user SET plan = ?, plan_expires_at = NOW() + INTERVAL ? DAY, on_trial = 1, trial_used_at = NOW(),
       trial_plan = ?, trial_reminded_at = NULL
     WHERE id = ? AND trial_used_at IS NULL`,
    [plan.id, plan.trialDays, plan.id, userId],
  );
  return res.affectedRows === 1 ? "ok" : "used";
}

/* ------------------------------- คำสั่งซื้อ ------------------------------- */

export interface Order {
  id: number;
  ref: string;
  userId: number;
  email?: string;
  plan: PlanId;
  months: number;
  amount: number;
  status: "pending" | "submitted" | "paid" | "cancelled";
  payerNote: string | null;
  createdAt: string;
  paidAt: string | null;
}

const toOrder = (r: RowDataPacket): Order => ({
  id: r.id,
  ref: r.ref,
  userId: r.user_id,
  email: r.email,
  plan: r.plan,
  months: r.months,
  amount: Number(r.amount),
  status: r.status,
  payerNote: r.payer_note,
  createdAt: String(r.created_at),
  paidAt: r.paid_at,
});

/** สร้างคำสั่งซื้อ — รหัสอ้างอิง 8 ตัวอักษร (ไม่มีตัวที่สับสนง่าย เช่น O/0, I/1) */
export async function createOrder(userId: number, plan: Plan, months: number): Promise<Order> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const ref = Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
  const amount = plan.price * months;
  await dbQuery(`INSERT INTO payment_order (ref, user_id, plan, months, amount) VALUES (?, ?, ?, ?, ?)`, [
    ref, userId, plan.id, months, amount,
  ]);
  const order = await getOrder(ref, userId);
  if (!order) throw new Error("create order failed");
  return order;
}

export async function getOrder(ref: string, userId?: number): Promise<Order | null> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT o.*, u.email FROM payment_order o JOIN app_user u ON u.id = o.user_id
     WHERE o.ref = ? ${userId !== undefined ? "AND o.user_id = ?" : ""}`,
    userId !== undefined ? [ref, userId] : [ref],
  );
  return rows[0] ? toOrder(rows[0]) : null;
}

export async function listUserOrders(userId: number): Promise<Order[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT o.*, u.email FROM payment_order o JOIN app_user u ON u.id = o.user_id
     WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 20`,
    [userId],
  );
  return rows.map(toOrder);
}

export async function submitPaymentNote(ref: string, userId: number, note: string): Promise<void> {
  await dbQuery(
    `UPDATE payment_order SET status = 'submitted', payer_note = ? WHERE ref = ? AND user_id = ? AND status IN ('pending','submitted')`,
    [note.slice(0, 255), ref, userId],
  );
}

export async function listOrdersForAdmin(): Promise<Order[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT o.*, u.email FROM payment_order o JOIN app_user u ON u.id = o.user_id
     ORDER BY FIELD(o.status, 'submitted', 'pending', 'paid', 'cancelled'), o.id DESC LIMIT 200`,
  );
  return rows.map(toOrder);
}

/**
 * ยืนยันรับชำระ → ต่ออายุแพ็กเกจ (ต่อจากวันหมดอายุเดิมถ้ายังไม่หมด)
 * ถ้าซื้อแพ็กเกจต่างจากเดิม จะเปลี่ยนแพ็กเกจและนับเวลาใหม่จากวันนี้
 */
export async function markOrderPaid(orderId: number): Promise<void> {
  const [o] = await dbQuery<RowDataPacket[]>(`SELECT * FROM payment_order WHERE id = ? AND status <> 'paid'`, [orderId]);
  if (!o) return;
  await dbQuery(
    `UPDATE app_user SET
       plan_expires_at = IF(plan = ? AND plan_expires_at > NOW(), plan_expires_at, NOW()) + INTERVAL ? MONTH,
       plan = ?, on_trial = 0
     WHERE id = ?`,
    [o.plan, o.months, o.plan, o.user_id],
  );
  await dbQuery(`UPDATE payment_order SET status = 'paid', paid_at = NOW() WHERE id = ?`, [orderId]);
}

export async function cancelOrder(orderId: number): Promise<void> {
  await dbQuery(`UPDATE payment_order SET status = 'cancelled' WHERE id = ? AND status <> 'paid'`, [orderId]);
}
