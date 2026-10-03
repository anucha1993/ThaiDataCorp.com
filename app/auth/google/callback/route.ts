/** Google ส่งผู้ใช้กลับมาที่นี่หลังอนุญาต (หรือปฏิเสธ) */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionForUser, getCurrentUser, safeNext, setSessionCookie } from "@/lib/auth";
import { googleExchangeCode, googleProfile } from "@/lib/google";
import { linkIdentity, loginWithExternal } from "@/lib/identity";
import { googleRedirectUri, OAUTH_COOKIE } from "@/app/auth/google/redirect-uri";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const store = await cookies();
  let saved: { state?: string; next?: string; link?: boolean } = {};
  try {
    saved = JSON.parse(store.get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    /* cookie เสีย → ถือว่าไม่ผ่าน state */
  }
  store.delete(OAUTH_COOKIE);
  const back = saved.link ? "/account" : "/login";

  // ผู้ใช้กดยกเลิกในหน้าของ Google
  if (url.searchParams.get("error")) redirect(`${back}?error=g-cancel`);
  const code = url.searchParams.get("code");
  if (!code || !saved.state || url.searchParams.get("state") !== saved.state) redirect(`${back}?error=g-state`);

  let profile: { id: string; name?: string; email?: string };
  try {
    profile = await googleProfile(await googleExchangeCode(code, googleRedirectUri(req.url)));
  } catch (e) {
    console.error("[auth] google callback failed:", e);
    redirect(`${back}?error=g-failed`);
  }
  const external = { provider: "google" as const, uid: profile.id, email: profile.email, name: profile.name };

  // เชื่อม Google กับบัญชีที่ login อยู่
  if (saved.link) {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=/account");
    const res = await linkIdentity(user.id, external);
    redirect(res === "ok" ? "/account?ok=g-linked#login-methods" : "/account?error=g-conflict#login-methods");
  }

  const result = await loginWithExternal(external);
  if ("pendingToken" in result) {
    // ต้องเข้าสู่ระบบด้วยรหัสผ่านก่อนแล้วจึงเชื่อม: อีเมลนี้มีบัญชีรหัสผ่านอยู่แล้ว (link-password)
    // หรือ Google ไม่ให้อีเมลที่ยืนยันแล้ว (need-email → เข้าสู่ระบบหรือสมัครด้วยอีเมลก็ได้)
    const q = new URLSearchParams({
      ext: result.email ? "link-password" : "need-email",
      pending: result.pendingToken,
      next: safeNext(saved.next),
    });
    if (result.email) q.set("email", result.email);
    redirect(`/login?${q}`);
  }
  await setSessionCookie(await createSessionForUser(result.userId));
  redirect(safeNext(saved.next));
}
