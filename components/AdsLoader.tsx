"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isExcludedPath, type PublicAdsConfig } from "@/lib/ads-config";
import { useMe, type Me } from "@/lib/use-me";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>> & { requestNonPersonalizedAds?: number };
    __tdcAdsScript?: boolean;
  }
}

/** ผู้ใช้ยินยอมคุกกี้ทั้งหมดหรือยัง (ไม่ยินยอม/ยังไม่ตัดสินใจ → โฆษณาแบบไม่ปรับตามบุคคล) */
function adsPersonalized(): boolean {
  return /(?:^|; )tdc_consent=all(?:;|$)/.test(document.cookie);
}

/** หน้านี้/ผู้ใช้นี้แสดงโฆษณาได้หรือไม่ — undefined = ยังไม่รู้ (รอสถานะสมาชิก) */
export function adsAllowed(path: string, cfg: Pick<PublicAdsConfig, "hideForPaid" | "extraExcluded">, me: Me | null): boolean | undefined {
  if (isExcludedPath(path, cfg)) return false;
  if (!cfg.hideForPaid) return true;
  if (me === null) return undefined;
  return !(me.loggedIn && me.paid);
}

/** ใส่สคริปต์ AdSense ครั้งเดียวต่อการเปิดเว็บ (async — ไม่บล็อกการแสดงผล) */
export function ensureAdsScript(publisherId: string): void {
  if (window.__tdcAdsScript) return;
  window.adsbygoogle = window.adsbygoogle ?? ([] as unknown as NonNullable<Window["adsbygoogle"]>);
  // ยังไม่ยินยอมคุกกี้โฆษณา → แสดงโฆษณาแบบไม่ใช้ข้อมูลส่วนบุคคล
  if (!adsPersonalized()) window.adsbygoogle.requestNonPersonalizedAds = 1;
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;
  document.head.appendChild(s);
  window.__tdcAdsScript = true;
}

/**
 * Auto ads: โหลดสคริปต์ทั้งเว็บ (ยกเว้นหน้าที่ห้าม/สมาชิกเสียเงิน) แล้วให้ AdSense เลือกตำแหน่งเอง
 * ถ้าปิด Auto ads สคริปต์จะโหลดเฉพาะหน้าที่มีตำแหน่งโฆษณาที่กำหนดเอง (AdSlot)
 */
export default function AdsLoader({ config }: { config: PublicAdsConfig }) {
  const pathname = usePathname();
  const [me] = useMe();
  useEffect(() => {
    if (config.autoAds && adsAllowed(pathname, config, me) === true) ensureAdsScript(config.publisherId);
  }, [pathname, me, config]);
  return null;
}
