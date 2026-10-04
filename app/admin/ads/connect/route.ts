/** เริ่มเชื่อมต่อบัญชี AdSense (OAuth — สิทธิ์อ่านรายงานอย่างเดียว) — เฉพาะผู้ดูแล */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isGoogleConfigured } from "@/lib/google";
import { ADSENSE_OAUTH_COOKIE, adsenseAuthorizeUrl, adsenseRedirectUri } from "@/lib/adsense-api";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/login?next=/admin/ads");
  if (!isGoogleConfigured()) redirect("/admin/ads?error=google-off");
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(ADSENSE_OAUTH_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin/ads",
    maxAge: 600,
  });
  redirect(adsenseAuthorizeUrl(state, adsenseRedirectUri(req.url)));
}
