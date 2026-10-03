"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ตรวจไฟล์ในเบราว์เซอร์ก่อนส่ง (จำนวน / ขนาดต่อไฟล์ / ขนาดรวม / ชนิด) — แจ้งเตือนทันทีและล้างช่องที่ผิด
 * ฝั่งเซิร์ฟเวอร์ตรวจซ้ำเสมอ (ตรวจชนิดจากเนื้อไฟล์จริง) ส่วนนี้มีไว้ให้ผู้ใช้รู้ก่อนรอนาน
 *
 * วางไว้ใน <form> — ตรวจทุก input[type=file] ที่มี data-max-mb / data-max-files / data-types
 */
export default function FileGuard({ totalMb }: { totalMb?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const inputs = [...form.querySelectorAll<HTMLInputElement>('input[type="file"]')];
    const check = (e?: Event) => {
      const target = e?.target as HTMLInputElement | undefined;
      let total = 0;
      for (const input of inputs) {
        const files = [...(input.files ?? [])];
        const maxMb = Number(input.dataset.maxMb || 0);
        const maxFiles = Number(input.dataset.maxFiles || 0);
        const types = (input.dataset.types || "").split(",").filter(Boolean);
        let problem: string | null = null;
        if (maxFiles && files.length > maxFiles) problem = `เลือกได้ไม่เกิน ${maxFiles} ไฟล์`;
        for (const f of files) {
          if (types.length && !types.includes(f.type)) problem = `"${f.name}" ไม่ใช่ชนิดไฟล์ที่รองรับ`;
          else if (maxMb && f.size > maxMb * 1024 * 1024) problem = `"${f.name}" ใหญ่เกิน ${maxMb}MB (${(f.size / 1048576).toFixed(1)}MB)`;
          total += f.size;
        }
        if (problem && (!target || target === input)) {
          input.value = "";
          setMsg(problem);
          return false;
        }
      }
      if (totalMb && total > totalMb * 1024 * 1024) {
        if (target) target.value = "";
        setMsg(`ไฟล์รวมกันใหญ่เกิน ${totalMb}MB (${(total / 1048576).toFixed(1)}MB)`);
        return false;
      }
      setMsg(null);
      return true;
    };
    const onSubmit = (e: SubmitEvent) => {
      if (!check()) e.preventDefault();
    };
    inputs.forEach((i) => i.addEventListener("change", check));
    form.addEventListener("submit", onSubmit);
    return () => {
      inputs.forEach((i) => i.removeEventListener("change", check));
      form.removeEventListener("submit", onSubmit);
    };
  }, [totalMb]);

  return (
    <span ref={ref} role="alert" className={msg ? "block border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" : "hidden"}>
      {msg}
    </span>
  );
}
