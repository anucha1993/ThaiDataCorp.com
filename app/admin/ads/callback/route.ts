/** รับผลการเชื่อมต่อ AdSense → เก็บ refresh token + รหัสบัญชี แล้วสั่งดึงรายงานรอบแรก */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { dbQuery } from "@/lib/db";
import { setInternalSettings } from "@/lib/settings";
import { ADSENSE_OAUTH_COOKIE, adsenseExchangeCode, adsenseFirstAccount, adsenseRedirectUri } from "@/lib/adsense-api";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/login?next=/admin/ads");
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get(ADSENSE_OAUTH_COOKIE)?.value;
  jar.delete({ name: ADSENSE_OAUTH_COOKIE, path: "/admin/ads" });
  if (url.searchParams.get("error")) redirect("/admin/ads?error=denied#report");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) redirect("/admin/ads?error=state#report");

  let result: "ok" | "no-refresh" | "no-account" | "failed" = "failed";
  try {
    const t = await adsenseExchangeCode(code, adsenseRedirectUri(req.url));
    const account = await adsenseFirstAccount(t.accessToken);
    if (!t.refreshToken) result = "no-refresh";
    else if (!account) result = "no-account";
    else {
      await setInternalSettings({
        adsense_refresh_token: t.refreshToken,
        adsense_account: account.name,
        adsense_account_name: account.displayName ?? account.name,
      });
      // ให้ตัวจัดคิวรันดึงรายงานรอบแรกทันที
      await dbQuery(`UPDATE job_schedule SET requested_at = UTC_TIMESTAMP() WHERE job_key = 'adsense-report'`).catch(() => {});
      result = "ok";
    }
  } catch (e) {
    console.error("[adsense] connect failed:", e);
  }
  revalidatePath("/admin/ads");
  redirect(result === "ok" ? "/admin/ads?ok=connected#report" : `/admin/ads?error=${result}#report`);
}
