"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * แถบโหลดบางๆ ด้านบนสุดของจอ — ขึ้นทันทีที่กดลิงก์/ส่งฟอร์มค้นหาภายในเว็บ และหายเมื่อหน้าใหม่แสดงแล้ว
 * ใช้ได้กับทุกหน้า (รวมหน้าที่ไม่มี loading.tsx เช่น หน้าบริษัท) ไม่มีผลกับ SEO (ไม่อยู่ใน HTML ที่ bot อ่าน)
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL เปลี่ยน = หน้าใหม่แสดงแล้ว → วิ่งให้สุดแล้วจางหาย
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    timer.current = setTimeout(() => setState("idle"), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname, searchParams]);

  useEffect(() => {
    const start = () => {
      if (timer.current) clearTimeout(timer.current);
      setState("loading");
      // กันค้าง (เช่น ดาวน์โหลดไฟล์ / ลิงก์ที่ไม่ได้เปลี่ยนหน้า)
      timer.current = setTimeout(() => setState("idle"), 15000);
    };
    const onClick = (e: MouseEvent) => {
      // ไม่เช็ก defaultPrevented เพราะ <Link> เรียก preventDefault เองเพื่อเปลี่ยนหน้าแบบ client
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.getAttribute("rel")?.includes("external")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      // ไฟล์ดาวน์โหลด/API ไม่ได้เปลี่ยนหน้า
      if (/^\/(export|api|media|badge)\//.test(url.pathname)) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (!e.defaultPrevented && form.target !== "_blank") start();
    };
    // submit ฟังแบบ bubble (หลังตัวตรวจไฟล์/ฟอร์มที่อาจยกเลิกการส่ง) — click ฟังแบบ capture
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  if (state === "idle") return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div
        className={`h-full bg-wiki-link shadow-[0_0_6px_rgba(51,102,204,0.6)] ${
          state === "loading" ? "animate-[navprogress_8s_cubic-bezier(0.1,0.7,0.2,1)_forwards]" : "w-full opacity-0 transition-opacity duration-300"
        }`}
      />
    </div>
  );
}
