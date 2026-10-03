"use server";
/**
 * Server Actions ของระบบสมาชิก — ทุกฟังก์ชันตรวจสิทธิ์เองเสมอ (เรียกตรงด้วย POST ได้)
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  consumeLoginToken,
  createLoginToken,
  destroySession,
  getCurrentUser,
  normalizeEmail,
  requireUser,
  safeNext,
  setSessionCookie,
} from "@/lib/auth";
import {
  addSavedSearch,
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
import { pendingHash, unlinkIdentity } from "@/lib/identity";
import { isMailConfigured, sendMail } from "@/lib/mailer";
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

export async function requestLogin(formData: FormData) {
  const email = normalizeEmail(formData.get("email"));
  const next = safeNext(formData.get("next"));
  if (!email) redirect(`/login?error=email&next=${encodeURIComponent(next)}`);

  const pending = await pendingHash(String(formData.get("pending") ?? "") || null);
  const token = await createLoginToken(email, next, pending);
  if (!token) redirect(`/login?error=rate&next=${encodeURIComponent(next)}`);

  const link = `${await baseUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: `ลิงก์เข้าสู่ระบบ ${SITE_NAME}`,
    text: `กดลิงก์นี้เพื่อเข้าสู่ระบบ ${SITE_NAME} (ใช้ได้ 30 นาที ครั้งเดียว):\n\n${link}\n\nหากคุณไม่ได้ขอเข้าสู่ระบบ ไม่ต้องทำอะไร`,
    html: `<p>กดปุ่มด้านล่างเพื่อเข้าสู่ระบบ ${SITE_NAME} (ใช้ได้ 30 นาที ครั้งเดียว)</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0645ad;color:#fff;text-decoration:none">เข้าสู่ระบบ</a></p>
      <p style="color:#54595d;font-size:12px">หากคุณไม่ได้ขอเข้าสู่ระบบ ไม่ต้องทำอะไร</p>`,
  });

  // โหมดพัฒนาที่ยังไม่ตั้ง SMTP: แสดงลิงก์บนหน้าจอเพื่อทดสอบได้
  const devLink = !isMailConfigured() && process.env.NODE_ENV !== "production" ? `&dev=${encodeURIComponent(link)}` : "";
  redirect(`/login?sent=1&email=${encodeURIComponent(email)}${devLink}`);
}

export async function confirmLogin(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const result = token ? await consumeLoginToken(token) : null;
  if (!result) redirect("/login?error=token");
  await setSessionCookie(result.sessionToken);
  if (result.linked === "conflict") redirect("/account?error=fb-conflict#login-methods");
  if (result.linked === "ok") redirect("/account?ok=fb-linked#login-methods");
  redirect(result.next);
}

export async function unlinkFacebook() {
  const user = await requireUser("/account");
  await unlinkIdentity(user.id, "facebook");
  redirect("/account?ok=fb-unlinked#login-methods");
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

