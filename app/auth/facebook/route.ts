/**
 * เริ่มเข้าสู่ระบบ/เชื่อมบัญชีด้วย Facebook
 *   /auth/facebook?next=/account          เข้าสู่ระบบหรือสมัคร
 *   /auth/facebook?link=1                 เชื่อม Facebook กับบัญชีที่ login อยู่ (จากหน้าบัญชี)
 */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { facebookAuthorizeUrl, isFacebookConfigured } from "@/lib/facebook";
import { facebookRedirectUri, OAUTH_COOKIE } from "@/app/auth/facebook/redirect-uri";

export async function GET(req: Request) {
  if (!isFacebookConfigured()) redirect("/login?error=fb-off");
  const url = new URL(req.url);
  const state = randomBytes(24).toString("base64url");
  const link = url.searchParams.get("link") === "1";
  // state กัน CSRF — เก็บใน cookie อายุสั้นแล้วเทียบตอน callback
  (await cookies()).set(OAUTH_COOKIE, JSON.stringify({ state, next: safeNext(url.searchParams.get("next")), link }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/facebook",
    maxAge: 600,
  });
  redirect(facebookAuthorizeUrl(state, facebookRedirectUri(req.url)));
}
