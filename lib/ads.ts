/** อ่านการตั้งค่าโฆษณา Shopee Affiliate จาก DB (cache 30 วินาทีผ่าน lib/settings) */
import { getSetting } from "@/lib/settings";
import { parseAdsConfig, type AdsConfig } from "@/lib/ads-config";

export async function getAdsConfig(): Promise<AdsConfig> {
  return parseAdsConfig(await getSetting("affiliate_config").catch(() => undefined));
}
