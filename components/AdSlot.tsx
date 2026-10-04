"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { adsAllowed, ensureAdsScript } from "@/components/AdsLoader";
import { AD_PLACEMENTS, type AdPlacement } from "@/lib/ads-config";
import { useMe } from "@/lib/use-me";

/**
 * ตำแหน่งโฆษณา AdSense แบบกำหนดเอง
 * - จองพื้นที่ความสูงไว้ก่อน (min-height) → หน้าไม่กระตุกตอนโฆษณาโหลด (CLS ดี / ตามแนวทาง AdSense)
 * - มีป้าย "โฆษณา" ชัดเจน และเว้นระยะจากเนื้อหา/ปุ่ม (กันการคลิกโดยไม่ตั้งใจ)
 * - ไม่แสดงในหน้าที่ห้าม และไม่แสดงให้สมาชิกเสียเงิน (ถ้าตั้งไว้)
 */
export default function AdSlot({
  client,
  slot,
  placement,
  hideForPaid,
  extraExcluded,
}: {
  client: string;
  slot: string;
  placement: AdPlacement;
  hideForPaid: boolean;
  extraExcluded: string[];
}) {
  const pathname = usePathname();
  const [me] = useMe();
  const ref = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const [hidden, setHidden] = useState(false);
  const allowed = adsAllowed(pathname, { hideForPaid, extraExcluded }, me);

  useEffect(() => {
    if (allowed === false) setHidden(true);
    if (allowed !== true || pushed.current || !ref.current) return;
    ensureAdsScript(client);
    try {
      (window.adsbygoogle = window.adsbygoogle ?? ([] as unknown as NonNullable<Window["adsbygoogle"]>)).push({});
      pushed.current = true;
    } catch {
      /* ตัวบล็อกโฆษณา / สคริปต์โหลดไม่ได้ — ปล่อยพื้นที่ว่าง */
    }
  }, [allowed, client]);

  if (hidden) return null;
  const minHeight = AD_PLACEMENTS[placement].minHeight;
  return (
    <aside aria-label="โฆษณา" className="my-6 clear-both">
      <div className="mb-1 text-center text-[11px] tracking-wide text-wiki-muted">โฆษณา</div>
      <div style={{ minHeight }} className="overflow-hidden">
        <ins
          ref={ref}
          className="adsbygoogle"
          style={{ display: "block", minHeight }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
}
