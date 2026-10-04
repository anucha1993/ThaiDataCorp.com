/** อ่านการตั้งค่าโฆษณาจาก DB (cache 30 วินาทีผ่าน lib/settings) */
import { getSetting } from "@/lib/settings";
import { parseAdsConfig, type AdPageType, type AdPlacement, type AdsConfig, type PublicAdsConfig } from "@/lib/ads-config";

export async function getAdsConfig(): Promise<AdsConfig> {
  return parseAdsConfig(await getSetting("ads_config").catch(() => undefined));
}

/** ค่าสำหรับตัวโหลดสคริปต์ฝั่ง browser — null = ปิดโฆษณาทั้งเว็บ */
export async function getPublicAdsConfig(): Promise<PublicAdsConfig | null> {
  const c = await getAdsConfig();
  if (!c.enabled) return null;
  return { publisherId: c.publisherId, autoAds: c.autoAds, hideForPaid: c.hideForPaid, extraExcluded: c.extraExcluded };
}

/** รหัส ad unit ของตำแหน่งนี้บนหน้าประเภทนี้ — null = ไม่แสดง */
export async function getAdSlot(page: AdPageType, placement: AdPlacement): Promise<{ client: string; slot: string } | null> {
  const c = await getAdsConfig();
  if (!c.enabled || !c.pages[page] || !c.slots[placement]) return null;
  return { client: c.publisherId, slot: c.slots[placement] };
}
