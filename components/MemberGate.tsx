"use client";

import type { ReactNode } from "react";
import { useMe } from "@/lib/use-me";

/**
 * แสดงเนื้อหาตามสถานะ login บนหน้า static/ISR — ระหว่างรอคำตอบจาก /api/me ไม่แสดงทั้งสองแบบ
 * (กันสมาชิกเห็นปุ่ม "สมัครสมาชิก" แวบหนึ่ง)
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const [me] = useMe();
  return me && !me.loggedIn ? <>{children}</> : null;
}

export function MemberOnly({ children }: { children: ReactNode }) {
  const [me] = useMe();
  return me?.loggedIn ? <>{children}</> : null;
}
