/** Facebook ส่งผู้ใช้กลับมาที่นี่หลังอนุญาต (หรือปฏิเสธ) */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionForUser, getCurrentUser, safeNext, setSessionCookie } from "@/lib/auth";
import { facebookExchangeCode, facebookProfile } from "@/lib/facebook";
import { linkIdentity, loginWithExternal } from "@/lib/identity";
import { facebookRedirectUri, OAUTH_COOKIE } from "@/app/auth/facebook/redirect-uri";

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

  // ผู้ใช้กดยกเลิกในหน้าของ Facebook
  if (url.searchParams.get("error")) redirect(`${back}?error=fb-cancel`);
  const code = url.searchParams.get("code");
  if (!code || !saved.state || url.searchParams.get("state") !== saved.state) redirect(`${back}?error=fb-state`);

  let profile: { id: string; name?: string; email?: string };
  try {
    profile = await facebookProfile(await facebookExchangeCode(code, facebookRedirectUri(req.url)));
  } catch (e) {
    console.error("[auth] facebook callback failed:", e);
    redirect(`${back}?error=fb-failed`);
  }
  const external = { provider: "facebook" as const, uid: profile.id, email: profile.email, name: profile.name };

  // เชื่อม Facebook กับบัญชีที่ login อยู่
  if (saved.link) {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=/account");
    const res = await linkIdentity(user.id, external);
    redirect(res === "ok" ? "/account?ok=fb-linked#login-methods" : "/account?error=fb-conflict#login-methods");
  }

  const result = await loginWithExternal(external);
  if ("pendingToken" in result) {
    // ต้องเข้าสู่ระบบด้วยรหัสผ่านก่อนแล้วจึงเชื่อม: อีเมลนี้มีบัญชีรหัสผ่านอยู่แล้ว (link-password)
    // หรือ Facebook ไม่ให้อีเมล (need-email → เข้าสู่ระบบหรือสมัครด้วยอีเมลก็ได้)
    const q = new URLSearchParams({
      fb: result.email ? "link-password" : "need-email",
      pending: result.pendingToken,
      next: safeNext(saved.next),
    });
    if (result.email) q.set("email", result.email);
    redirect(`/login?${q}`);
  }
  await setSessionCookie(await createSessionForUser(result.userId));
  redirect(safeNext(saved.next));
}
