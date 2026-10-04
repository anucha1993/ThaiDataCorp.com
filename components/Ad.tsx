import AdSlot from "@/components/AdSlot";
import { getAdsConfig } from "@/lib/ads";
import type { AdPageType, AdPlacement } from "@/lib/ads-config";

/**
 * วางโฆษณาในหน้า (Server Component) — อ่านการตั้งค่าจาก /admin/ads
 * ถ้าปิดโฆษณา/ปิดประเภทหน้านี้/ยังไม่ใส่รหัส ad unit → ไม่ render อะไรเลย (ไม่มีพื้นที่ว่าง)
 */
export default async function Ad({ page, placement }: { page: AdPageType; placement: AdPlacement }) {
  const c = await getAdsConfig().catch(() => null);
  if (!c?.enabled || !c.pages[page] || !c.slots[placement]) return null;
  return (
    <AdSlot
      client={c.publisherId}
      slot={c.slots[placement]}
      placement={placement}
      hideForPaid={c.hideForPaid}
      extraExcluded={c.extraExcluded}
    />
  );
}
