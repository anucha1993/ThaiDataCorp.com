import AdSlot from "@/components/AdSlot";
import { getAdsConfig } from "@/lib/ads";
import { AD_PLACEMENTS, type AdPageType, type AdPlacement } from "@/lib/ads-config";
import { pickProducts } from "@/lib/affiliate-repo";

/**
 * การ์ดสินค้า Shopee Affiliate ในหน้า (Server Component) — ตั้งค่าที่ /admin/ads
 * ถ้าปิดโฆษณา/ปิดประเภทหน้านี้/ปิดตำแหน่งนี้/ยังไม่มีสินค้า → ไม่ render อะไรเลย
 * หน้าเป็น ISR → สินค้าที่สุ่มได้จะอยู่กับหน้านั้นจนกว่าจะสร้างหน้าใหม่
 */
export default async function Ad({ page, placement }: { page: AdPageType; placement: AdPlacement }) {
  const c = await getAdsConfig().catch(() => null);
  if (!c?.enabled || !c.pages[page] || !c.placements[placement]) return null;
  const products = await pickProducts(AD_PLACEMENTS[placement].count).catch(() => []);
  if (products.length === 0) return null;
  return <AdSlot products={products} placement={placement} hideForPaid={c.hideForPaid} extraExcluded={c.extraExcluded} />;
}
