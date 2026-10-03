/** Query สำหรับระบบหลังบ้าน (/admin/*) */
import "server-only";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { JOBS } from "@/lib/jobs";

/* -------------------------------- Dashboard -------------------------------- */

export async function getDashboard() {
  const [counts, users, revenue, orders, lastRuns, tables] = await Promise.all([
    dbQuery<RowDataPacket[]>(
      `SELECT (SELECT COUNT(*) FROM juristic) companies,
              (SELECT COUNT(*) FROM procurement_contract) contracts,
              (SELECT COUNT(*) FROM procurement_summary) winners,
              (SELECT COUNT(*) FROM juristic WHERE created_at >= CURDATE() - INTERVAL 7 DAY) companies_7d`,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) total,
              SUM(plan <> 'free' AND plan_expires_at > NOW()) paying,
              SUM(created_at >= CURDATE() - INTERVAL 30 DAY) new_30d
       FROM app_user`,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT COALESCE(SUM(IF(paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01'), amount, 0)), 0) this_month,
              COALESCE(SUM(amount), 0) all_time
       FROM payment_order WHERE status = 'paid'`,
    ),
    dbQuery<RowDataPacket[]>(`SELECT status, COUNT(*) n FROM payment_order GROUP BY status`),
    dbQuery<RowDataPacket[]>(
      `SELECT r.job_key, r.status, r.started_at, r.finished_at, r.id FROM job_run r
       JOIN (SELECT job_key, MAX(id) id FROM job_run GROUP BY job_key) m ON m.id = r.id`,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT table_name name, ROUND((data_length + index_length) / 1048576) mb, table_rows approx_rows
       FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY (data_length + index_length) DESC`,
    ),
  ]);
  const orderCount = Object.fromEntries(orders.map((o) => [o.status as string, Number(o.n)]));
  return {
    companies: Number(counts[0].companies),
    contracts: Number(counts[0].contracts),
    winners: Number(counts[0].winners),
    companies7d: Number(counts[0].companies_7d),
    users: Number(users[0].total ?? 0),
    paying: Number(users[0].paying ?? 0),
    newUsers30d: Number(users[0].new_30d ?? 0),
    revenueThisMonth: Number(revenue[0].this_month),
    revenueAllTime: Number(revenue[0].all_time),
    ordersWaiting: (orderCount.submitted ?? 0) + (orderCount.pending ?? 0),
    ordersSubmitted: orderCount.submitted ?? 0,
    lastRuns: new Map(lastRuns.map((r) => [r.job_key as string, r])),
    tables: tables.map((t) => ({ name: t.name as string, mb: Number(t.mb), rows: Number(t.approx_rows) })),
    totalMb: tables.reduce((s, t) => s + Number(t.mb), 0),
  };
}

/* ---------------------------------- Jobs ---------------------------------- */

export interface JobRow {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  cron: string;
  args: string | null;
  nextRunAt: string | null;
  requestedAt: string | null;
  last?: { id: number; status: string; startedAt: string; finishedAt: string | null; heartbeatAt: string | null };
}

export async function listJobs(): Promise<JobRow[]> {
  const [sched, last] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT * FROM job_schedule`),
    dbQuery<RowDataPacket[]>(
      `SELECT r.* FROM job_run r JOIN (SELECT job_key, MAX(id) id FROM job_run GROUP BY job_key) m ON m.id = r.id`,
    ),
  ]);
  const s = new Map(sched.map((r) => [r.job_key as string, r]));
  const l = new Map(last.map((r) => [r.job_key as string, r]));
  return JOBS.map((j) => {
    const r = s.get(j.key);
    const run = l.get(j.key);
    return {
      key: j.key,
      label: j.label,
      description: j.description,
      enabled: Number(r?.enabled ?? 0) === 1,
      cron: r?.cron ?? "0 3 * * *",
      args: r?.args ?? null,
      nextRunAt: r?.next_run_at ?? null,
      requestedAt: r?.requested_at ?? null,
      last: run
        ? { id: run.id, status: run.status, startedAt: run.started_at, finishedAt: run.finished_at, heartbeatAt: run.heartbeat_at }
        : undefined,
    };
  });
}

export async function listRuns(jobKey?: string, limit = 100) {
  return dbQuery<RowDataPacket[]>(
    `SELECT id, job_key, trigger_by, args, status, exit_code, started_at, finished_at,
       TIMESTAMPDIFF(SECOND, started_at, COALESCE(finished_at, NOW())) secs
     FROM job_run ${jobKey ? "WHERE job_key = ?" : ""} ORDER BY id DESC LIMIT ?`,
    jobKey ? [jobKey, limit] : [limit],
  );
}

export async function getRun(id: number) {
  const [r] = await dbQuery<RowDataPacket[]>(
    `SELECT *, TIMESTAMPDIFF(SECOND, started_at, COALESCE(finished_at, NOW())) secs FROM job_run WHERE id = ?`,
    [id],
  );
  return r ?? null;
}

/* -------------------------------- Members --------------------------------- */

export async function listMembers(opts: { q?: string; plan?: string; page?: number }) {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.q) (where.push("u.email LIKE ?"), params.push(`%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
  if (opts.plan === "paying") where.push("u.plan <> 'free' AND u.plan_expires_at > NOW()");
  else if (opts.plan === "expired") where.push("u.plan <> 'free' AND (u.plan_expires_at IS NULL OR u.plan_expires_at <= NOW())");
  else if (opts.plan) (where.push("u.plan = ?"), params.push(opts.plan));
  const size = 50;
  const offset = (Math.max(1, opts.page ?? 1) - 1) * size;
  const [rows, count] = await Promise.all([
    dbQuery<RowDataPacket[]>(
      `SELECT u.*, (u.plan_expires_at > NOW()) active,
         (SELECT COUNT(*) FROM user_watch w WHERE w.user_id = u.id) watches,
         (SELECT COUNT(*) FROM saved_search s WHERE s.user_id = u.id) searches,
         (SELECT COALESCE(SUM(amount), 0) FROM payment_order o WHERE o.user_id = u.id AND o.status = 'paid') paid_total,
         (SELECT MAX(created_at) FROM user_session x WHERE x.user_id = u.id) last_login
       FROM app_user u WHERE ${where.join(" AND ")} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    ),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM app_user u WHERE ${where.join(" AND ")}`, params),
  ]);
  return { rows, total: Number(count[0]?.n ?? 0), size };
}

export async function getMember(id: number) {
  const [u] = await dbQuery<RowDataPacket[]>(`SELECT *, (plan_expires_at > NOW()) active FROM app_user WHERE id = ?`, [id]);
  if (!u) return null;
  const [watches, searches, orders, sessions, identities] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT kind, target, created_at FROM user_watch WHERE user_id = ? ORDER BY created_at DESC`, [id]),
    dbQuery<RowDataPacket[]>(`SELECT id, tsic_code, province FROM saved_search WHERE user_id = ?`, [id]),
    dbQuery<RowDataPacket[]>(`SELECT * FROM payment_order WHERE user_id = ? ORDER BY id DESC`, [id]),
    dbQuery<RowDataPacket[]>(`SELECT created_at, expires_at FROM user_session WHERE user_id = ? AND expires_at > NOW()`, [id]),
    dbQuery<RowDataPacket[]>(`SELECT provider, name, email, created_at FROM user_identity WHERE user_id = ?`, [id]),
  ]);
  return { user: u, watches, searches, orders, sessions, identities };
}

/** ตั้งแพ็กเกจ + วันหมดอายุโดยตรง (expires = null สำหรับ free) */
export async function setMemberPlan(id: number, plan: string, expires: string | null) {
  await dbQuery(`UPDATE app_user SET plan = ?, plan_expires_at = ?, on_trial = 0 WHERE id = ?`, [plan, expires, id]);
}

export async function extendMember(id: number, months: number) {
  await dbQuery(
    `UPDATE app_user SET plan_expires_at = GREATEST(COALESCE(plan_expires_at, NOW()), NOW()) + INTERVAL ? MONTH WHERE id = ?`,
    [months, id],
  );
}

export async function revokeSessions(id: number) {
  await dbQuery(`DELETE FROM user_session WHERE user_id = ?`, [id]);
}

/** ลบบัญชีและข้อมูลทั้งหมดของสมาชิก (คำสั่งซื้อที่ชำระแล้วเก็บไว้เป็นหลักฐานทางบัญชี แต่ตัดความเชื่อมโยงอีเมล) */
export async function deleteMember(id: number) {
  await dbQuery(`DELETE FROM user_session WHERE user_id = ?`, [id]);
  await dbQuery(`DELETE FROM user_watch WHERE user_id = ?`, [id]);
  await dbQuery(`DELETE FROM saved_search WHERE user_id = ?`, [id]);
  await dbQuery(`DELETE FROM user_identity WHERE user_id = ?`, [id]);
  await dbQuery(`DELETE FROM payment_order WHERE user_id = ? AND status <> 'paid'`, [id]);
  const [u] = await dbQuery<RowDataPacket[]>(`SELECT email FROM app_user WHERE id = ?`, [id]);
  if (u) await dbQuery(`DELETE FROM auth_token WHERE email = ?`, [u.email]);
  const [paid] = await dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM payment_order WHERE user_id = ?`, [id]);
  if (Number(paid?.n ?? 0) > 0) {
    // เก็บแถวผู้ใช้ไว้ให้คำสั่งซื้อที่ชำระแล้วอ้างอิงได้ แต่ลบอีเมลออก
    await dbQuery(`UPDATE app_user SET email = CONCAT('deleted-', id, '@deleted.invalid'), plan = 'free', plan_expires_at = NULL WHERE id = ?`, [id]);
  } else {
    await dbQuery(`DELETE FROM app_user WHERE id = ?`, [id]);
  }
}

/* --------------------------------- Plans ---------------------------------- */

export async function listPlanRows() {
  return dbQuery<RowDataPacket[]>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM app_user u WHERE u.plan = p.id AND (p.id = 'free' OR u.plan_expires_at > NOW())) members,
       (SELECT COUNT(*) FROM app_user u WHERE u.plan = p.id AND u.on_trial = 1 AND u.plan_expires_at > NOW()) trialing,
       (SELECT COUNT(*) FROM app_user u WHERE u.trial_plan = p.id) trials_total
     FROM plan p ORDER BY sort, price`,
  );
}
