"use server";
/**
 * Server Actions ของระบบหลังบ้าน — ทุกฟังก์ชันตรวจสิทธิ์ผู้ดูแลก่อนเสมอ
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, setUserPassword } from "@/lib/auth";
import { passwordProblem } from "@/lib/password";
import {
  deleteMember,
  extendMember,
  getRun,
  revokeSessions,
  setMemberPlan,
} from "@/lib/admin-repo";
import { dbQuery } from "@/lib/db";
import { isValidCron, jobByKey, nextRunUtc, parseArgs } from "@/lib/jobs";
import { FREE_PLAN_ID, getPlans, invalidatePlans, isValidPlanSlug } from "@/lib/plans";
import { SETTINGS, setSettings } from "@/lib/settings";

async function requireAdmin() {
  const user = await requireUser("/admin");
  if (!user.isAdmin) redirect("/account");
  return user;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string, min = 0, max = 1_000_000) => Math.min(max, Math.max(min, Math.round(Number(f.get(k)) || 0)));

/* ---------------------------------- Jobs ---------------------------------- */

export async function saveJob(formData: FormData) {
  await requireAdmin();
  const key = str(formData, "key");
  if (!jobByKey(key)) redirect("/admin/jobs?error=job");
  const cron = str(formData, "cron").replace(/\s+/g, " ");
  if (!(await isValidCron(cron))) redirect(`/admin/jobs?error=cron&job=${key}`);
  const enabled = formData.get("enabled") === "on";
  const args = parseArgs(str(formData, "args")).join(" ") || null;
  await dbQuery(
    `INSERT INTO job_schedule (job_key, enabled, cron, args, next_run_at) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), cron = VALUES(cron), args = VALUES(args), next_run_at = VALUES(next_run_at)`,
    [key, enabled ? 1 : 0, cron, args, enabled ? await nextRunUtc(cron) : null],
  );
  redirect(`/admin/jobs?ok=saved&job=${key}`);
}

/**
 * รันงานทันที — เริ่ม process แยก (detached) จากเว็บ
 * ถ้าเริ่มไม่ได้ (เช่น hosting ไม่อนุญาต) จะตั้ง requested_at ให้ jobs:tick รอบถัดไปรันแทน
 */
export async function runJobNow(formData: FormData) {
  const user = await requireAdmin();
  const job = jobByKey(str(formData, "key"));
  if (!job) redirect("/admin/jobs?error=job");
  const args = parseArgs(str(formData, "args"));
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  let started = false;
  try {
    const child = spawn(
      process.execPath,
      [tsxCli, path.join("scripts", "run-job.ts"), job.key, `--trigger=manual:${user.email}`, ...args],
      { cwd: process.cwd(), env: process.env, detached: true, stdio: "ignore", windowsHide: true },
    );
    child.on("error", (e) => console.error("[admin] run job spawn error:", e));
    child.unref();
    started = Boolean(child.pid);
  } catch (e) {
    console.error("[admin] run job failed to start:", e);
  }
  if (!started) {
    await dbQuery(`UPDATE job_schedule SET requested_at = UTC_TIMESTAMP() WHERE job_key = ?`, [job.key]);
    redirect(`/admin/jobs?ok=queued&job=${job.key}`);
  }
  redirect(`/admin/jobs?ok=started&job=${job.key}`);
}

/** หยุดงานที่กำลังรัน (ส่งสัญญาณไปที่ process — ใช้ได้เมื่อเว็บกับงานอยู่เครื่องเดียวกัน) */
export async function stopRun(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  const run = await getRun(id);
  if (run?.status === "running" && run.pid) {
    try {
      process.kill(Number(run.pid));
    } catch {
      /* process อาจจบไปแล้ว */
    }
    await dbQuery(
      `UPDATE job_run SET status = 'failed', finished_at = NOW(), log = CONCAT(COALESCE(log, ''), '\n■ หยุดโดยผู้ดูแล\n') WHERE id = ?`,
      [id],
    );
  }
  redirect(`/admin/jobs/${id}`);
}

/* --------------------------------- Members -------------------------------- */

export async function adminSetPlan(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  const plans = await getPlans();
  const plan = str(formData, "plan");
  if (!plans[plan]) redirect(`/admin/members/${id}?error=plan`);
  const expires = str(formData, "expires"); // YYYY-MM-DD
  if (plan !== FREE_PLAN_ID && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) redirect(`/admin/members/${id}?error=expires`);
  await setMemberPlan(id, plan, plan === FREE_PLAN_ID ? null : `${expires} 23:59:59`);
  redirect(`/admin/members/${id}?ok=plan`);
}

export async function adminExtend(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  await extendMember(id, int(formData, "months", 1, 36));
  redirect(`/admin/members/${id}?ok=extended`);
}

export async function adminRevoke(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  await revokeSessions(id);
  redirect(`/admin/members/${id}?ok=revoked`);
}

export async function adminSetPassword(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  const password = String(formData.get("password") ?? "");
  if (passwordProblem(password)) redirect(`/admin/members/${id}?error=password`);
  await setUserPassword(id, null, password);
  // ให้ทุกอุปกรณ์ที่ค้างอยู่ต้องเข้าสู่ระบบใหม่ด้วยรหัสใหม่
  await revokeSessions(id);
  redirect(`/admin/members/${id}?ok=password`);
}

export async function adminDeleteMember(formData: FormData) {
  const me = await requireAdmin();
  const id = int(formData, "id", 1);
  if (str(formData, "confirm") !== "DELETE") redirect(`/admin/members/${id}?error=confirm`);
  if (id === me.id) redirect(`/admin/members/${id}?error=self`);
  await deleteMember(id);
  redirect("/admin/members?ok=deleted");
}

/* ---------------------------------- Plans --------------------------------- */

export async function savePlan(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id").toLowerCase();
  if (!isValidPlanSlug(id)) redirect("/admin/plans?error=slug");
  const isFree = id === FREE_PLAN_ID;
  const name = str(formData, "name").slice(0, 64) || id;
  const features = str(formData, "features").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join("\n");
  await dbQuery(
    `INSERT INTO plan (id, name, price, trial_days, max_watches, max_saved_searches, alert_every_days, export_rows, export_contracts, features, active, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), trial_days = VALUES(trial_days),
       max_watches = VALUES(max_watches),
       max_saved_searches = VALUES(max_saved_searches), alert_every_days = VALUES(alert_every_days),
       export_rows = VALUES(export_rows), export_contracts = VALUES(export_contracts), features = VALUES(features),
       active = VALUES(active), sort = VALUES(sort)`,
    [
      id,
      name,
      isFree ? 0 : int(formData, "price", 0, 1_000_000),
      isFree ? 0 : int(formData, "trial_days", 0, 90),
      int(formData, "max_watches", 0, 100_000),
      int(formData, "max_saved_searches", 0, 10_000),
      int(formData, "alert_every_days", 1, 90),
      int(formData, "export_rows", 0, 1_000_000),
      formData.get("export_contracts") === "on" ? 1 : 0,
      features,
      isFree || formData.get("active") === "on" ? 1 : 0,
      int(formData, "sort", 0, 1000),
    ],
  );
  invalidatePlans();
  revalidatePath("/pricing");
  redirect(`/admin/plans?ok=saved#plan-${id}`);
}

export async function deletePlan(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  if (id === FREE_PLAN_ID) redirect("/admin/plans?error=free");
  const [used] = await dbQuery<import("mysql2").RowDataPacket[]>(
    `SELECT (SELECT COUNT(*) FROM app_user WHERE plan = ?) + (SELECT COUNT(*) FROM payment_order WHERE plan = ?) n`,
    [id, id],
  );
  if (Number(used?.n ?? 0) > 0) redirect("/admin/plans?error=in-use");
  await dbQuery(`DELETE FROM plan WHERE id = ?`, [id]);
  invalidatePlans();
  revalidatePath("/pricing");
  redirect("/admin/plans?ok=deleted");
}

/* -------------------------------- Settings -------------------------------- */

export async function saveSettings(formData: FormData) {
  await requireAdmin();
  const values: Record<string, string> = {};
  for (const s of SETTINGS) values[s.key] = s.type === "toggle" ? (formData.get(s.key) === "on" ? "1" : "0") : str(formData, s.key);
  await setSettings(values);
  invalidatePlans();
  revalidatePath("/", "layout"); // header/หน้าราคาเปลี่ยนตามโหมด
  redirect("/admin/settings?ok=saved");
}
