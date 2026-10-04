"use client";

import { useEffect, useRef } from "react";

/**
 * ช่องเลือกช่วงเวลาของหน้าสถิติ:
 * - เลือกช่วงสำเร็จรูป (วันนี้/7 วัน/...) → แสดงผลทันที ไม่ต้องกด "แสดง"
 * - แก้ช่อง "ตั้งแต่/ถึง" → สลับเป็น "กำหนดเอง" ให้อัตโนมัติ
 * ไม่มี JavaScript ก็ยังใช้ได้ (เลือกแล้วกด "แสดง")
 */
export default function RangeSelect({
  name = "range",
  defaultValue,
  className,
  options,
}: {
  name?: string;
  defaultValue: string;
  className?: string;
  options: Array<[value: string, label: string]>;
}) {
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const select = ref.current;
    const form = select?.form;
    if (!select || !form) return;
    const onDate = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.type === "date") select.value = "custom";
    };
    form.addEventListener("change", onDate);
    return () => form.removeEventListener("change", onDate);
  }, []);

  return (
    <select
      ref={ref}
      name={name}
      defaultValue={defaultValue}
      className={className}
      onChange={(e) => {
        const form = e.currentTarget.form;
        if (!form || e.currentTarget.value === "custom") return;
        // ช่วงสำเร็จรูป: ไม่ส่งวันที่เดิมไปด้วย (ไม่งั้นระบบจะถือว่ากำหนดวันที่เอง)
        form.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((d) => (d.disabled = true));
        form.requestSubmit();
      }}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
