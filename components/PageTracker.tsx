"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// กันนับซ้ำ: React StrictMode (dev) เรียก effect 2 ครั้ง และ re-render ที่ path เดิมติดกัน
let last = { key: "", at: 0 };

/** ส่งการเข้าชมหน้าไปที่ /api/track ทุกครั้งที่เปลี่ยนหน้า (รวมการนำทางฝั่ง client) */
export default function PageTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();

  useEffect(() => {
    const key = `${pathname}${qs ? `?${qs}` : ""}`;
    const now = Date.now();
    if (last.key === key && now - last.at < 2000) return;
    last = { key, at: now };
    // referrer ภายนอกมีความหมายเฉพาะหน้าแรกที่เข้ามา — หน้าถัดไปในเว็บเป็นการคลิกภายใน
    const first = !(window as unknown as { __tdcTracked?: boolean }).__tdcTracked;
    (window as unknown as { __tdcTracked?: boolean }).__tdcTracked = true;
    const body = JSON.stringify({ p: key, r: first ? document.referrer : "" });
    try {
      if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
        fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
      }
    } catch {
      /* ไม่ให้การนับสถิติทำให้หน้าเว็บพัง */
    }
  }, [pathname, qs]);

  return null;
}
