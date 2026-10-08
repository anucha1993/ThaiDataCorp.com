"use server";
/**
 * Server Actions ของระบบหลังบ้าน — ทุกฟังก์ชันตรวจสิทธิ์ผู้ดูแลก่อนเสมอ
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminEmails, requireUser, setUserPassword } from "@/lib/auth";
import { passwordProblem } from "@/lib/password";
import {
  deleteMember,
  extendMember,
  getRun,
  revokeSessions,
  setMemberPlan,
  suspendMember,
  unsuspendMember,
} from "@/lib/admin-repo";
import { dbQuery } from "@/lib/db";
import { isValidCron, jobByKey, nextRunUtc, parseArgs } from "@/lib/jobs";
import { FREE_PLAN_ID, getPlans, invalidatePlans, isValidPlanSlug } from "@/lib/plans";
import { getSupportEmail, SETTINGS, setInternalSettings, setSettings } from "@/lib/settings";
import { SITE_NAME, SITE_URL } from "@/lib/format";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { adminSetJobHidden, adminSetNewsHidden, decideClaim, removeCompanyMember, setProfileHidden } from "@/lib/business";
import { cleanContact, getRequest, isRequestStatus, publishContact, removeContact, REQUEST_STATUS, REQUEST_TYPES, updateRequest } from "@/lib/support";

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
  // มีงานอื่นรันอยู่ → ต่อคิวให้ตัวจัดคิวเริ่มเมื่อว่าง (กันหลายงานกินหน่วยความจำพร้อมกันจนถูกโฮสต์ปิด)
  const [busy] = await dbQuery<import("mysql2").RowDataPacket[]>(
    `SELECT job_key FROM job_run WHERE status = 'running' AND COALESCE(heartbeat_at, started_at) > NOW() - INTERVAL 10 MINUTE LIMIT 1`,
  );
  if (busy && !args.length) {
    await dbQuery(`UPDATE job_schedule SET requested_at = UTC_TIMESTAMP() WHERE job_key = ?`, [job.key]);
    redirect(`/admin/jobs?ok=queued&job=${job.key}`);
  }
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

/** บัญชีผู้ดูแลลบ/ระงับจากหน้านี้ไม่ได้ — ต้องถอดอีเมลออกจากรายชื่อผู้ดูแลก่อน */
async function isAdminAccount(id: number): Promise<boolean> {
  const [r] = await dbQuery<import("mysql2").RowDataPacket[]>(`SELECT email FROM app_user WHERE id = ?`, [id]);
  return Boolean(r) && (await adminEmails()).has(String(r.email).toLowerCase());
}

export async function adminDeleteMember(formData: FormData) {
  const me = await requireAdmin();
  const id = int(formData, "id", 1);
  if (await isAdminAccount(id)) redirect(`/admin/members/${id}?error=is-admin`);
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

/* -------------------------------------------------------------- คำร้อง */

export async function adminUpdateRequest(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  const status = str(formData, "status");
  const r = await getRequest(id);
  if (!r || !isRequestStatus(status)) redirect(`/admin/requests/${id}?error=status`);
  await updateRequest(id, status, str(formData, "note").slice(0, 5000) || null);

  // แจ้งผู้ส่งทางอีเมล (ถ้าเลือกและตั้ง SMTP แล้ว)
  const reply = str(formData, "reply").slice(0, 5000);
  if (formData.get("notify") === "1" && isMailConfigured()) {
    const support = await getSupportEmail();
    await sendMail({
      to: r.email,
      subject: `[${r.ticket}] ${REQUEST_STATUS[status].label} — ${SITE_NAME}`,
      text:
        `เรียน คุณ${r.name}\n\nคำร้อง "${REQUEST_TYPES[r.type]?.label ?? r.type}" เลขที่ ${r.ticket}\n` +
        `สถานะ: ${REQUEST_STATUS[status].label}\n${reply ? `\n${reply}\n` : ""}\n` +
        `ติดตามสถานะ: ${SITE_URL}/contact/status?ticket=${r.ticket}\n\n${SITE_NAME}\n${support}`,
    }).catch((e) => console.error("[admin] notify requester failed:", e));
  }
  redirect(`/admin/requests/${id}?ok=updated`);
}

/** เผยแพร่ข้อมูลติดต่อบนหน้าบริษัท (แก้ค่าก่อนเผยแพร่ได้) แล้วปิดคำร้อง */
export async function adminPublishContact(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  const r = await getRequest(id);
  if (!r?.juristicId) redirect(`/admin/requests/${id}?error=nocompany`);
  const c = cleanContact({
    phone: str(formData, "phone"), email: str(formData, "email"), website: str(formData, "website"),
    lineId: str(formData, "lineId"), facebook: str(formData, "facebook"),
  });
  if ("error" in c) redirect(`/admin/requests/${id}?error=${c.error}`);
  await publishContact(r.juristicId, c.contact, r.ticket);
  await updateRequest(id, "resolved", r.adminNote ? `${r.adminNote}\nเผยแพร่ข้อมูลติดต่อแล้ว` : "เผยแพร่ข้อมูลติดต่อแล้ว");
  revalidatePath(`/company/${r.juristicId}`);
  redirect(`/admin/requests/${id}?ok=published`);
}

export async function adminRemoveContact(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  const juristicId = str(formData, "juristicId");
  if (/^\d{13}$/.test(juristicId)) {
    await removeContact(juristicId);
    revalidatePath(`/company/${juristicId}`);
  }
  redirect(`/admin/requests/${id}?ok=removed`);
}

/* --------------------------------------------------------- บัญชีบริษัท */

export async function adminDecideClaim(formData: FormData) {
  const admin = await requireAdmin();
  const id = int(formData, "id", 1);
  const approve = str(formData, "decision") === "approve";
  const note = str(formData, "note").slice(0, 2000) || null;
  if (!approve && !note) redirect(`/admin/business/claims/${id}?error=note`);
  const c = await decideClaim(id, approve, admin.id, note);
  if (!c) redirect(`/admin/business/claims/${id}?error=state`);
  revalidatePath(`/company/${c.juristicId}`);
  if (isMailConfigured() && c.userEmail) {
    await sendMail({
      to: c.userEmail,
      subject: approve ? `ยืนยันบัญชีบริษัทสำเร็จ — ${SITE_NAME}` : `ผลการยืนยันบัญชีบริษัท — ${SITE_NAME}`,
      text: approve
        ? `เรียน คุณ${c.contactName}\n\nบัญชีบริษัท ${c.companyName ?? c.juristicId} ได้รับการยืนยันแล้ว\nจัดการข้อมูลบริษัท ลงประกาศงาน และโพสต์ข่าวได้ที่ ${SITE_URL}/business/${c.juristicId}\n\nเอกสารที่ส่งมาถูกลบออกจากระบบแล้ว\n\n${SITE_NAME}`
        : `เรียน คุณ${c.contactName}\n\nคำขอยืนยันบัญชีบริษัท ${c.companyName ?? c.juristicId} ยังไม่ผ่านการพิจารณา\nเหตุผล: ${note}\n\nยื่นใหม่ได้ที่ ${SITE_URL}/business/claim?id=${c.juristicId}\nเอกสารที่ส่งมาถูกลบออกจากระบบแล้ว\n\n${SITE_NAME}\n${await getSupportEmail()}`,
    }).catch((e) => console.error("[admin] claim notify failed:", e));
  }
  redirect(`/admin/business?ok=${approve ? "approved" : "rejected"}`);
}

export async function adminToggleJob(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  const juristicId = await adminSetJobHidden(id, formData.get("hide") === "1");
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
  if (juristicId) revalidatePath(`/company/${juristicId}`);
  redirect(`/admin/business?tab=jobs`);
}

export async function adminToggleNews(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  const juristicId = await adminSetNewsHidden(id, formData.get("hide") === "1");
  revalidatePath(`/news/${id}`);
  revalidatePath("/news");
  if (juristicId) revalidatePath(`/company/${juristicId}`);
  redirect(`/admin/business?tab=news`);
}

export async function adminCompanyAccess(formData: FormData) {
  await requireAdmin();
  const juristicId = str(formData, "juristicId");
  if (!/^\d{13}$/.test(juristicId)) redirect("/admin/business?tab=companies");
  const userId = int(formData, "userId", 0);
  if (userId) await removeCompanyMember(juristicId, userId);
  if (formData.has("hidden")) await setProfileHidden(juristicId, formData.get("hidden") === "1");
  revalidatePath(`/company/${juristicId}`);
  revalidatePath("/jobs");
  revalidatePath("/news");
  redirect(`/admin/business?tab=companies`);
}

export async function adminSuspendMember(formData: FormData) {
  const me = await requireAdmin();
  const id = int(formData, "id", 1);
  const reason = str(formData, "reason").slice(0, 500);
  if (id === me.id) redirect(`/admin/members/${id}?error=self`);
  if (await isAdminAccount(id)) redirect(`/admin/members/${id}?error=is-admin`);
  if (reason.length < 3) redirect(`/admin/members/${id}?error=reason`);
  await suspendMember(id, reason, me.id);
  redirect(`/admin/members/${id}?ok=suspended`);
}

/** ไม่นับ/นับสถิติการเข้าชมของสมาชิกคนนี้ */
export async function adminSetNoAnalytics(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  const on = formData.get("no_analytics") === "1";
  await dbQuery(`UPDATE app_user SET no_analytics = ? WHERE id = ?`, [on ? 1 : 0, id]);
  redirect(`/admin/members/${id}?ok=${on ? "no-analytics" : "analytics"}`);
}

/** ตั้งค่าการไม่นับสถิติ: ผู้ดูแลทั้งหมด / เครื่องนี้ */
export async function setAnalyticsExclusion(formData: FormData) {
  await requireAdmin();
  const what = str(formData, "what");
  if (what === "admins-on" || what === "admins-off") {
    await setInternalSettings({ analytics_exclude_admins: what === "admins-on" ? "1" : "0" });
  }
  if (what === "device-on" || what === "device-off") {
    const jar = await cookies();
    if (what === "device-on") {
      jar.set("tdc_notrack", "1", { maxAge: 2 * 365 * 86400, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    } else jar.delete("tdc_notrack");
  }
  redirect(`/admin/analytics?ok=${what}#exclude`);
}

/** ลบสถิติที่มาจาก IP ปัจจุบันของผู้ดูแล (ล้างการเข้าชมระหว่างทดสอบเว็บ) — ต้องพิมพ์ยืนยัน */
export async function purgeMyIpViews(formData: FormData) {
  await requireAdmin();
  if (str(formData, "confirm") !== "DELETE") redirect("/admin/analytics?error=confirm#exclude");
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  if (!ip) redirect("/admin/analytics?error=no-ip#exclude");
  const res = await dbQuery<import("mysql2").ResultSetHeader>(`DELETE FROM page_view WHERE ip = ?`, [ip]);
  redirect(`/admin/analytics?ok=purged&n=${res.affectedRows}#exclude`);
}

export async function adminUnsuspendMember(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id", 1);
  await unsuspendMember(id);
  redirect(`/admin/members/${id}?ok=unsuspended`);
}
