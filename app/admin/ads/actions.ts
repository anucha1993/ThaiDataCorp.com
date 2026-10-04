"use server";
/** จัดการโฆษณา Google AdSense — เฉพาะผู้ดูแล */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { setInternalSettings } from "@/lib/settings";
import { dbQuery } from "@/lib/db";
import {
  AD_PAGE_TYPES,
  AD_PLACEMENTS,
  isPublisherId,
  isSlotId,
  type AdPageType,
  type AdPlacement,
  type AdsConfig,
} from "@/lib/ads-config";

async function requireAdmin() {
  const user = await requireUser("/admin/ads");
  if (!user.isAdmin) redirect("/account");
  return user;
}

export async function saveAdsConfig(formData: FormData) {
  await requireAdmin();
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  // รับได้ทั้ง "ca-pub-123..." และ "pub-123..."
  const pub = s("publisherId").replace(/^pub-/, "ca-pub-");
  if (pub && !isPublisherId(pub)) redirect("/admin/ads?error=publisher");
  const slots = {} as Record<AdPlacement, string>;
  for (const k of Object.keys(AD_PLACEMENTS) as AdPlacement[]) {
    const v = s(`slot_${k}`);
    if (v && !isSlotId(v)) redirect(`/admin/ads?error=slot`);
    slots[k] = v;
  }
  const pages = {} as Record<AdPageType, boolean>;
  for (const k of Object.keys(AD_PAGE_TYPES) as AdPageType[]) pages[k] = formData.get(`page_${k}`) === "1";
  const enabled = formData.get("enabled") === "1";
  if (enabled && !pub) redirect("/admin/ads?error=need-publisher");

  const cfg: AdsConfig = {
    enabled,
    publisherId: pub,
    autoAds: formData.get("autoAds") === "1",
    hideForPaid: formData.get("hideForPaid") === "1",
    slots,
    pages,
    extraExcluded: s("extraExcluded")
      .split(/[\s,]+/)
      .filter((p) => p.startsWith("/"))
      .slice(0, 50),
    adsTxtExtra: s("adsTxtExtra").slice(0, 4000),
  };
  await setInternalSettings({ ads_config: JSON.stringify(cfg) });
  // หน้าเว็บเป็น ISR → สร้างใหม่ทั้งเว็บให้โฆษณา/meta/นโยบายเปลี่ยนตามทันที
  revalidatePath("/", "layout");
  redirect("/admin/ads?ok=saved");
}

export async function disconnectAdsense() {
  await requireAdmin();
  await setInternalSettings({ adsense_refresh_token: null, adsense_account: null, adsense_account_name: null });
  redirect("/admin/ads?ok=disconnected#report");
}

export async function syncAdsenseNow() {
  await requireAdmin();
  await dbQuery(`UPDATE job_schedule SET requested_at = UTC_TIMESTAMP() WHERE job_key = 'adsense-report'`);
  redirect("/admin/ads?ok=sync-queued#report");
}
