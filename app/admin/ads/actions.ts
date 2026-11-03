"use server";
/** จัดการโฆษณาสินค้า Shopee Affiliate — เฉพาะผู้ดูแล */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { setInternalSettings } from "@/lib/settings";
import { AD_PAGE_TYPES, AD_PLACEMENTS, type AdPageType, type AdPlacement, type AdsConfig } from "@/lib/ads-config";
import { parseAffiliateCsv } from "@/lib/affiliate-csv";
import { deleteAllProducts, deleteProduct, importProducts, setProductActive, setProductImage } from "@/lib/affiliate-repo";

async function requireAdmin() {
  const user = await requireUser("/admin/ads");
  if (!user.isAdmin) redirect("/account");
  return user;
}

/** หน้าเว็บเป็น ISR → สร้างใหม่ทั้งเว็บให้การ์ดสินค้าเปลี่ยนตามทันที */
const refreshSite = () => revalidatePath("/", "layout");

export async function saveAdsConfig(formData: FormData) {
  await requireAdmin();
  const placements = {} as Record<AdPlacement, boolean>;
  for (const k of Object.keys(AD_PLACEMENTS) as AdPlacement[]) placements[k] = formData.get(`place_${k}`) === "1";
  const pages = {} as Record<AdPageType, boolean>;
  for (const k of Object.keys(AD_PAGE_TYPES) as AdPageType[]) pages[k] = formData.get(`page_${k}`) === "1";

  const cfg: AdsConfig = {
    enabled: formData.get("enabled") === "1",
    hideForPaid: formData.get("hideForPaid") === "1",
    placements,
    pages,
    extraExcluded: String(formData.get("extraExcluded") ?? "")
      .split(/[\s,]+/)
      .filter((p) => p.startsWith("/"))
      .slice(0, 50),
  };
  await setInternalSettings({ affiliate_config: JSON.stringify(cfg) });
  refreshSite();
  redirect("/admin/ads?ok=saved");
}

export async function importCsv(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/admin/ads?error=no-file#products");
  if (file.size > 5 * 1024 * 1024) redirect("/admin/ads?error=too-big#products");
  const { rows, skipped, headers } = parseAffiliateCsv(await file.text());
  if (rows.length === 0) {
    redirect(`/admin/ads?error=no-rows&headers=${encodeURIComponent(headers.join(" | ").slice(0, 500))}#products`);
  }
  const { added, updated } = await importProducts(rows);
  refreshSite();
  redirect(`/admin/ads?ok=imported&added=${added}&updated=${updated}&skipped=${skipped}#products`);
}

export async function toggleProduct(formData: FormData) {
  await requireAdmin();
  await setProductActive(Number(formData.get("id")), formData.get("active") === "1");
  refreshSite();
  redirect("/admin/ads#products");
}

export async function updateProductImage(formData: FormData) {
  await requireAdmin();
  const url = String(formData.get("imageUrl") ?? "").trim();
  if (url && !/^https:\/\/\S+$/i.test(url)) redirect("/admin/ads?error=image#products");
  await setProductImage(Number(formData.get("id")), url.slice(0, 1000) || null);
  refreshSite();
  redirect("/admin/ads#products");
}

export async function removeProduct(formData: FormData) {
  await requireAdmin();
  await deleteProduct(Number(formData.get("id")));
  refreshSite();
  redirect("/admin/ads#products");
}

export async function removeAllProducts() {
  await requireAdmin();
  await deleteAllProducts();
  refreshSite();
  redirect("/admin/ads?ok=cleared#products");
}
