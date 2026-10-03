"use client";

import { useEffect, useRef, useState } from "react";

/**
 * รายการแบบเพิ่ม/ลบ/เลื่อนแถว (เช่น สินค้า/บริการ) — แต่ละแถวส่งเป็น input ชื่อเดียวกันหลายค่า (formData.getAll(name))
 */
export default function RowListEditor({
  name,
  initial,
  max = 30,
  maxLength = 200,
  placeholder,
}: {
  name: string;
  initial: string[];
  max?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  // key คงที่ต่อแถว (ลบ/เลื่อนแล้ว React ไม่สลับค่าผิดช่อง)
  const [rows, setRows] = useState(() => (initial.length ? initial : [""]).map((v, i) => ({ id: i, v })));
  const [nextId, setNextId] = useState(rows.length);
  const box = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState<number | null>(null);

  // เพิ่มแถวแล้วย้ายเคอร์เซอร์ไปแถวใหม่
  useEffect(() => {
    if (focusId === null) return;
    box.current?.querySelector<HTMLInputElement>(`input[data-row="${focusId}"]`)?.focus();
    setFocusId(null);
  }, [focusId, rows]);

  const add = () => {
    if (rows.length >= max) return;
    setRows([...rows, { id: nextId, v: "" }]);
    setFocusId(nextId);
    setNextId(nextId + 1);
  };
  const remove = (id: number) => setRows(rows.length > 1 ? rows.filter((r) => r.id !== id) : [{ id: nextId, v: "" }]);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const copy = [...rows];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setRows(copy);
  };
  const btn = "flex h-8 w-8 shrink-0 items-center justify-center border border-wiki-border bg-white text-wiki-muted hover:border-wiki-text hover:text-wiki-text disabled:opacity-30";

  return (
    <div ref={box} className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-1.5">
          <span className="w-6 shrink-0 text-right text-wiki-muted tabular-nums">{i + 1}.</span>
          <input
            data-row={r.id}
            name={name}
            value={r.v}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, v: e.target.value } : x)))}
            onKeyDown={(e) => {
              // Enter = เพิ่มแถวใหม่ (ไม่ส่งฟอร์ม)
              if (e.key === "Enter") (e.preventDefault(), i === rows.length - 1 && add());
            }}
            className="min-w-0 flex-1 border border-wiki-border bg-white px-3 py-1.5 outline-none focus:border-wiki-link"
          />
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={btn} aria-label="เลื่อนขึ้น" title="เลื่อนขึ้น">
            ↑
          </button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className={btn} aria-label="เลื่อนลง" title="เลื่อนลง">
            ↓
          </button>
          <button type="button" onClick={() => remove(r.id)} className={`${btn} hover:border-red-700! hover:text-red-800!`} aria-label="ลบแถว" title="ลบแถว">
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={rows.length >= max}
        className="ml-7 border border-dashed border-wiki-border bg-white px-3 py-1 text-sm hover:border-wiki-text disabled:opacity-40"
      >
        + เพิ่มรายการ {rows.length >= max && `(ครบ ${max} รายการ)`}
      </button>
    </div>
  );
}
