"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/actions";
import { resetMe, useMe } from "@/lib/use-me";

const itemCls = "block w-full px-4 py-2 text-left text-sm text-wiki-link hover:bg-wiki-bg hover:no-underline";

/**
 * เมนูบัญชีมุมขวาบน — ใช้สถานะจาก useMe() (ถาม /api/me หลังโหลดหน้า หน้าเว็บจึงยัง cache แบบ static ได้)
 * ระหว่างรอคำตอบแสดงลิงก์แบบยังไม่ login ไว้ก่อน
 */
export default function UserNav({ billing }: { billing: boolean }) {
  const pathname = usePathname();
  const [me, setMe] = useMe();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // เปลี่ยนหน้าแล้วปิดเมนู
  useEffect(() => setOpen(false), [pathname]);

  // ปิดเมนูเมื่อคลิกข้างนอกหรือกด Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (me?.loggedIn) {
    return (
      <nav aria-label="บัญชี" className="flex shrink-0 items-center text-sm">
        <div ref={boxRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            title={me.email}
            className="flex items-center gap-1.5 font-bold text-wiki-link hover:underline"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
              <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-9 2.2-9 5v3h18v-3c0-2.8-4.6-5-9-5z" />
            </svg>
            <span className="max-w-40 truncate">{me.name}</span>
            <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true" fill="currentColor" className={open ? "rotate-180" : ""}>
              <path d="M5 7l5 6 5-6z" />
            </svg>
          </button>
          {open && (
            <div role="menu" className="absolute right-0 z-50 mt-2 w-56 border border-wiki-border bg-white py-1 shadow-md">
              <div className="truncate border-b border-wiki-border-light px-4 py-2 text-xs text-wiki-muted">{me.email}</div>
              <Link href="/account" role="menuitem" className={itemCls}>
                บัญชีของฉัน
              </Link>
              {me.isAdmin && (
                <Link href="/admin" role="menuitem" className={itemCls}>
                  หลังบ้าน (Admin)
                </Link>
              )}
              {/* logout พาไปหน้าแรก — ถ้าอยู่หน้าแรกอยู่แล้ว pathname ไม่เปลี่ยน จึงเคลียร์สถานะเองทันที */}
              <form action={logout} onSubmit={() => (resetMe(), setMe({ loggedIn: false }))} className="border-t border-wiki-border-light">
                <button type="submit" role="menuitem" className={`${itemCls} cursor-pointer text-red-800!`}>
                  ออกจากระบบ
                </button>
              </form>
            </div>
          )}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="บัญชี" className="flex shrink-0 gap-4 text-sm">
      {billing && <Link href="/pricing">แพ็กเกจ</Link>}
      <Link href="/login">เข้าสู่ระบบ</Link>
      <Link href="/register">{billing ? "สมัครสมาชิก" : "สมัครสมาชิกฟรี"}</Link>
    </nav>
  );
}
