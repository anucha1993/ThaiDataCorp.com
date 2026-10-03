"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type Me = { loggedIn: false } | { loggedIn: true; name: string; email: string; isAdmin: boolean };

/** ใช้คำตอบร่วมกันทุก component ในหน้าเดียวกัน (Header + กล่องในเนื้อหา) — ยิง /api/me ครั้งเดียวต่อหน้า */
let shared: { path: string; promise: Promise<Me> } | null = null;

function fetchMe(path: string): Promise<Me> {
  if (shared?.path !== path) {
    shared = {
      path,
      promise: fetch("/api/me", { cache: "no-store" })
        .then((r) => r.json() as Promise<Me>)
        .catch(() => ({ loggedIn: false }) as Me),
    };
  }
  return shared.promise;
}

/** ล้างค่าที่จำไว้ (เช่น หลังกดออกจากระบบ) */
export function resetMe(): void {
  shared = null;
}

/**
 * สถานะผู้ใช้ฝั่ง browser — null ระหว่างรอคำตอบ
 * หน้าเว็บส่วนใหญ่เป็น static/ISR (ไม่อ่าน cookie ตอน render) จึงถามสถานะหลังโหลดหน้าแทน
 */
export function useMe(): [Me | null, (m: Me) => void] {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMe(pathname).then((m) => !cancelled && setMe(m));
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  return [me, setMe];
}
