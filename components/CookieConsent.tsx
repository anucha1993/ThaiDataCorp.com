"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * แบนเนอร์ขอความยินยอมคุกกี้ (PDPA)
 * - tdc_consent = "all" | "essential"  เก็บทางเลือกของผู้ใช้ 12 เดือน (คุกกี้จำเป็น — ไม่ต้องขอความยินยอม)
 * - tdc_vid     รหัสผู้เข้าชมแบบสุ่ม (คุกกี้สถิติ) — วางเฉพาะเมื่อกด "ยอมรับ" และลบทันทีเมื่อปฏิเสธ/ถอนความยินยอม
 * เปิดหน้าต่างนี้ใหม่ได้จากลิงก์ "ตั้งค่าคุกกี้" ใน footer (event "tdc:cookie-settings")
 */
const YEAR = 365 * 86400;

function readCookie(name: string): string | null {
  return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] ?? null;
}

function writeCookie(name: string, value: string, maxAge: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function CookieConsent({ ads = false }: { ads?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!readCookie("tdc_consent")) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener("tdc:cookie-settings", reopen);
    return () => window.removeEventListener("tdc:cookie-settings", reopen);
  }, []);

  const choose = (all: boolean) => {
    writeCookie("tdc_consent", all ? "all" : "essential", YEAR);
    if (all) {
      if (!readCookie("tdc_vid")) writeCookie("tdc_vid", randomId(), Math.round(YEAR * 1.08)); // ~13 เดือน
    } else {
      writeCookie("tdc_vid", "", 0); // ถอนความยินยอม → ลบคุกกี้สถิติ
    }
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="การตั้งค่าคุกกี้"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-wiki-border bg-white px-4 py-3 shadow-[0_-2px_8px_rgb(0_0_0/0.08)]"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm md:flex-row md:items-center">
        <p className="flex-1 leading-6">
          เว็บไซต์นี้ใช้<b>คุกกี้ที่จำเป็น</b>สำหรับการเข้าสู่ระบบ และขออนุญาตใช้<b>คุกกี้สถิติ</b>เพื่อนับจำนวนผู้เข้าชมโดยไม่ระบุตัวตน
          {ads ? (
            <>
              {" "}
              และ<b>คุกกี้โฆษณา</b>ของ Google เพื่อแสดงโฆษณาที่ตรงความสนใจ (ถ้าไม่ยอมรับ จะเห็นโฆษณาทั่วไปที่ไม่ใช้ข้อมูลส่วนบุคคล)
            </>
          ) : (
            " ไม่ใช้คุกกี้โฆษณา และไม่ส่งข้อมูลให้บุคคลภายนอก"
          )}{" "}
          · <Link href="/terms#cookies">รายละเอียด</Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => choose(false)} className="border border-wiki-text bg-white px-4 py-1.5 font-bold hover:bg-wiki-bg">
            เฉพาะที่จำเป็น
          </button>
          <button type="button" onClick={() => choose(true)} className="border border-wiki-text bg-wiki-text px-4 py-1.5 font-bold text-white hover:bg-[#3a3d40]">
            ยอมรับทั้งหมด
          </button>
        </div>
      </div>
    </div>
  );
}

/** ลิงก์ "ตั้งค่าคุกกี้" (footer) — เปิดแบนเนอร์อีกครั้งเพื่อเปลี่ยน/ถอนความยินยอม */
export function CookieSettingsLink() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("tdc:cookie-settings"))} className="cursor-pointer text-wiki-link hover:underline">
      ตั้งค่าคุกกี้
    </button>
  );
}
