"use client";

import { useRef, useState } from "react";

/**
 * ช่องอัปโหลดไฟล์ที่มองเห็นชัด (แทน input[type=file] ของเบราว์เซอร์ที่ข้อความเป็นภาษาอังกฤษและกลืนกับพื้น)
 * - กดเลือก หรือลากไฟล์มาวาง · แสดงชื่อ/ขนาดไฟล์ที่เลือก · ลบทีละไฟล์ได้
 * - ใช้ input[type=file] จริงด้านใน (ซ่อนแบบยังโฟกัสได้) → ฟอร์มส่งได้ตามปกติ และ FileGuard ตรวจขนาด/ชนิดได้เหมือนเดิม
 */
export default function FilePicker({
  name,
  accept,
  multiple = false,
  required = false,
  maxMb,
  maxFiles,
  types,
  hint,
}: {
  name: string;
  accept: string;
  multiple?: boolean;
  required?: boolean;
  maxMb: number;
  maxFiles?: number;
  /** MIME types ที่รับ (ให้ FileGuard ตรวจ) */
  types: string;
  hint: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);

  // อ่านหลัง FileGuard ทำงาน (อาจล้างไฟล์ที่ผิดเงื่อนไขทิ้ง) เพื่อให้รายการตรงกับของจริง
  const sync = () => setTimeout(() => setFiles([...(ref.current?.files ?? [])]), 0);
  const setInputFiles = (list: File[]) => {
    if (!ref.current) return;
    const dt = new DataTransfer();
    for (const f of list) dt.items.add(f);
    ref.current.files = dt.files;
    // แจ้ง FileGuard ให้ตรวจใหม่
    ref.current.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
  };

  return (
    <div>
      <label
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const dropped = [...e.dataTransfer.files];
          setInputFiles(multiple ? [...files, ...dropped] : dropped.slice(0, 1));
        }}
        className={`relative flex cursor-pointer flex-wrap items-center gap-3 border-2 border-dashed px-4 py-3 text-sm transition-colors ${
          drag ? "border-wiki-link bg-blue-50" : "border-wiki-border bg-white hover:border-wiki-text"
        }`}
      >
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-wiki-muted">
          <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="inline-block bg-wiki-text px-4 py-1.5 font-bold text-white">{multiple ? "เลือกไฟล์ (หลายไฟล์ได้)" : "เลือกไฟล์"}</span>
        <span className="min-w-0 flex-1 text-wiki-muted">
          {files.length ? `เลือกแล้ว ${files.length} ไฟล์` : "หรือลากไฟล์มาวางที่นี่"}
          <span className="block text-xs">{hint}</span>
        </span>
        <input
          ref={ref}
          type="file"
          name={name}
          accept={accept}
          multiple={multiple}
          required={required}
          data-max-mb={maxMb}
          data-max-files={maxFiles ?? (multiple ? undefined : 1)}
          data-types={types}
          onChange={sync}
          // ซ่อนแบบยังโฟกัสได้ (ให้เบราว์เซอร์แสดงคำเตือน required ได้)
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      {files.length > 0 && (
        <ul className="mt-1 space-y-1 text-xs">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 border border-wiki-border-light bg-wiki-bg px-2 py-1">
              <span className="min-w-0 flex-1 truncate">📄 {f.name}</span>
              <span className="text-wiki-muted tabular-nums">
                {f.size >= 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`}
              </span>
              <button
                type="button"
                onClick={() => setInputFiles(files.filter((_, j) => j !== i))}
                className="px-1 text-red-800 hover:underline"
                aria-label={`เอา ${f.name} ออก`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
