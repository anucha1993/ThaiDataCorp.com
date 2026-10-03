"use server";
/**
 * Server Actions ของระบบสมาชิก — ทุกฟังก์ชันตรวจสิทธิ์เองเสมอ (เรียกตรงด้วย POST ได้)
 */
import { headers } from "next/headers";
import { describeFilters, filtersFromQuery, filtersToQuery } from "@/lib/search-filters";
import { getTsicName } from "@/lib/tsic-name";
import { redirect } from "next/navigation";
import {
  createSessionForUser,
  destroySession,
  getCurrentUser,
  loginWithPassword,
  normalizeEmail,
  registerWithPassword,
  requireUser,
  safeNext,
  setSessionCookie,
  setUserPassword,
} from "@/lib/auth";
import {
  addSavedSearch,
  addSavedQuery,
  addWatch,
  cancelOrder,
  createOrder,
  startTrial,
  markOrderPaid,
  removeSavedSearch,
  removeWatch,
  submitPaymentNote,
  type WatchKind,
} from "@/lib/account-repo";
import { isValidJuristicId } from "@/lib/juristic-id";
import { completePending, pendingHash, unlinkIdentity } from "@/lib/identity";
import { passwordProblem } from "@/lib/password";
import { sendMail } from "@/lib/mailer";
import { getPlans } from "@/lib/plans";
import { isBillingEnabled } from "@/lib/billing";
import { SITE_NAME, SITE_URL } from "@/lib/format";

/** URL หลักของเว็บสำหรับลิงก์ในอีเมล (ใช้ host ของ request ตอนพัฒนา) */
async function baseUrl(): Promise<string> {
  if (process.env.NODE_ENV === "production") return SITE_URL;
  const h = await headers();
  const host = h.get("host");
  return host ? `http://${host}` : SITE_URL;
}

/* -------------------------------- Login -------------------------------- */

/** query string สำหรับส่งกลับไปหน้าฟอร์มพร้อมค่าเดิม (ไม่ส่งรหัสผ่านกลับ) */
function backQuery(error: string, email: string, next: string, pending: string): string {
  const q = new URLSearchParams({ error, next });
  if (email) q.set("email", email);
  if (pending) q.set("pending", pending);
  return q.toString();
}

/** เข้าสู่ระบบสำเร็จ → ตั้ง cookie + เชื่อม Google ที่รออยู่ (ถ้ามี) แล้วไปหน้าปลายทาง */
async function finishLogin(userId: number, pending: string, next: string): Promise<never> {
  const hash = await pendingHash(pending || null);
  const linked = hash ? await completePending(hash, userId) : undefined;
  await setSessionCookie(await createSessionForUser(userId));
  if (linked === "conflict") redirect("/account?error=g-conflict#login-methods");
  if (linked === "ok") redirect("/account?ok=g-linked#login-methods");
  redirect(next);
}

export async function loginAction(formData: FormData) {
  const rawEmail = String(formData.get("email") ?? "").trim().slice(0, 255);
  const email = normalizeEmail(rawEmail);
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const pending = String(formData.get("pending") ?? "").slice(0, 100);
  if (!email || !password) redirect(`/login?${backQuery("invalid", rawEmail, next, pending)}`);
  const res = await loginWithPassword(email, password);
  if ("error" in res) redirect(`/login?${backQuery(res.error, email, next, pending)}`);
  await finishLogin(res.userId, pending, next);
}

export async function registerAction(formData: FormData) {
  const rawEmail = String(formData.get("email") ?? "").trim().slice(0, 255);
  const email = normalizeEmail(rawEmail);
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const pending = String(formData.get("pending") ?? "").slice(0, 100);
  // สมัครในนามบริษัท: สมัครเสร็จแล้วพาไปยื่นเอกสารยืนยันบริษัทต่อทันที
  const asCompany = formData.get("as") === "company";
  const juristicId = String(formData.get("juristicId") ?? "").replace(/\D/g, "").slice(0, 13);
  const fail: (error: string) => never = (error) =>
    redirect(`/register?${backQuery(error, rawEmail, next, pending)}${asCompany ? `&as=company${juristicId ? `&id=${juristicId}` : ""}` : ""}`);
  if (!email) fail("email");
  const problem = passwordProblem(password);
  if (problem) fail(problem);
  if (password !== String(formData.get("password2") ?? "")) fail("mismatch");
  if (formData.get("accept") !== "1") fail("terms");
  const res = await registerWithPassword(email, password);
  if ("error" in res) fail(res.error);
  await finishLogin(res.userId, pending, asCompany ? `/business/claim${juristicId.length === 13 ? `?id=${juristicId}` : ""}` : next);
}

export async function changePassword(formData: FormData) {
  const user = await requireUser("/account");
  const password = String(formData.get("password") ?? "");
  const back: (key: string) => never = (key) => redirect(`/account?${key}#login-methods`);
  const problem = passwordProblem(password);
  if (problem) back(`error=pw-${problem}`);
  if (password !== String(formData.get("password2") ?? "")) back("error=pw-mismatch");
  const res = await setUserPassword(user.id, user.hasPassword ? String(formData.get("current") ?? "") : null, password);
  back(res === "ok" ? "ok=password" : "error=pw-current");
}

export async function unlinkGoogle() {
  const user = await requireUser("/account");
  // ไม่มีรหัสผ่าน + ยกเลิก Google = เข้าบัญชีไม่ได้อีก
  if (!user.hasPassword) redirect("/account?error=g-unlink-nopw#login-methods");
  await unlinkIdentity(user.id, "google");
  redirect("/account?ok=g-unlinked#login-methods");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

/* ------------------------------- Watches ------------------------------- */

function parseWatch(formData: FormData): { kind: WatchKind; target: string } | null {
  const kind = String(formData.get("kind") ?? "");
  const target = String(formData.get("target") ?? "").trim();
  if (kind === "company" && isValidJuristicId(target)) return { kind, target };
  if (kind === "agency" && target.length > 1 && target.length <= 255) return { kind, target };
  return null;
}

export async function watchTarget(formData: FormData) {
  const back = safeNext(formData.get("back"), "/account");
  const w = parseWatch(formData);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!w) redirect("/account?error=watch");
  const res = await addWatch(user.id, user.plan, w.kind, w.target);
  redirect(res === "limit" ? "/account?error=watch-limit" : "/account?ok=watch#watches");
}

export async function unwatchTarget(formData: FormData) {
  const user = await requireUser("/account");
  const w = parseWatch(formData);
  if (w) await removeWatch(user.id, w.kind, w.target);
  redirect("/account#watches");
}

/* ---------------------------- Saved searches ---------------------------- */

export async function addSearch(formData: FormData) {
  const user = await requireUser("/account");
  const tsic = String(formData.get("tsic") ?? "").trim() || null;
  const province = String(formData.get("province") ?? "").trim() || null;
  const res = await addSavedSearch(user.id, user.plan, tsic && /^\d{5}$/.test(tsic) ? tsic : null, province);
  redirect(res === "ok" ? "/account?ok=search#searches" : `/account?error=search-${res}#searches`);
}

/** บันทึกการค้นหาขั้นสูงจากหน้า /search (Lead Finder) — แจ้งเตือนรายชื่อใหม่ที่ตรงเงื่อนไขทางอีเมล */
export async function saveSearchQuery(formData: FormData) {
  const raw = String(formData.get("query") ?? "").slice(0, 1000);
  const f = filtersFromQuery(raw);
  // เก็บรูปแบบมาตรฐาน (ตัด page/ค่าที่ไม่ถูกต้องทิ้ง) กันบันทึกซ้ำต่างรูปแบบ
  const query = filtersToQuery(f);
  const back = `/search?${query}`;
  const user = await requireUser(back);
  if (!query) redirect(back);
  const tsicName = f.tsic ? await getTsicName(f.tsic) : null;
  const res = await addSavedQuery(user.id, user.plan, query, describeFilters(f, tsicName));
  redirect(`${back}&saved=${res}`);
}

export async function removeSearch(formData: FormData) {
  const user = await requireUser("/account");
  await removeSavedSearch(user.id, Number(formData.get("id")));
  redirect("/account#searches");
}

/* -------------------------------- Orders -------------------------------- */

export async function startOrder(formData: FormData) {
  if (!(await isBillingEnabled())) redirect("/pricing");
  const plan = (await getPlans())[String(formData.get("plan") ?? "")];
  const months = Math.min(12, Math.max(1, Number(formData.get("months") ?? 1) || 1));
  if (!plan || !plan.active || plan.price <= 0) redirect("/pricing");
  const user = await requireUser("/pricing");
  const order = await createOrder(user.id, plan, months);
  redirect(`/pay/${order.ref}`);
}

export async function startTrialAction(formData: FormData) {
  if (!(await isBillingEnabled())) redirect("/pricing");
  const plan = (await getPlans())[String(formData.get("plan") ?? "")];
  if (!plan) redirect("/pricing");
  const user = await requireUser("/pricing");
  const res = await startTrial(user.id, plan);
  if (res !== "ok") redirect(`/pricing?trial=${res}`);
  redirect("/account?ok=trial");
}

export async function submitPayment(formData: FormData) {
  const ref = String(formData.get("ref") ?? "");
  const user = await requireUser(`/pay/${ref}`);
  const note = String(formData.get("note") ?? "").trim();
  if (!note) redirect(`/pay/${ref}?error=note`);
  await submitPaymentNote(ref, user.id, note);

  // แจ้งผู้ดูแลทางอีเมล (ถ้าตั้ง ADMIN_EMAILS ไว้)
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (admins.length) {
    await sendMail({
      to: admins.join(","),
      subject: `[${SITE_NAME}] มีการแจ้งโอนเงิน ${ref}`,
      text: `ผู้ใช้ ${user.email} แจ้งโอนเงินคำสั่งซื้อ ${ref}\nข้อมูลการโอน: ${note}\n\nตรวจสอบและยืนยันได้ที่ ${await baseUrl()}/admin/orders`,
    }).catch((e) => console.error("[actions] notify admin failed:", e));
  }
  redirect(`/pay/${ref}?submitted=1`);
}

/* -------------------------------- Admin --------------------------------- */

async function requireAdmin() {
  const user = await requireUser("/admin");
  if (!user.isAdmin) redirect("/account");
  return user;
}

export async function adminMarkPaid(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (id > 0) await markOrderPaid(id);
  redirect("/admin/orders?ok=paid");
}

export async function adminCancel(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (id > 0) await cancelOrder(id);
  redirect("/admin/orders?ok=cancelled");
}

