"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  /** หัวข้อกลุ่ม (แสดงเป็นหัวข้อคั่นในรายการ) */
  group?: string;
}

/**
 * Dropdown ที่พิมพ์ค้นหาได้ — ใช้แทน <select> ที่มีตัวเลือกเยอะ (จังหวัด / ประเภทธุรกิจ / เดือน)
 * ก่อน JavaScript โหลดเสร็จแสดง <select> ธรรมดา (ฟอร์มยังส่งได้แม้ปิด JS) แล้วจึงเปลี่ยนเป็นช่องค้นหา
 * ค่าที่เลือกส่งไปกับฟอร์มผ่าน <input type="hidden" name={name}>
 */
export default function SearchableSelect({
  name,
  options,
  defaultValue = "",
  emptyLabel,
  className = "",
  id,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  /** ตัวเลือกค่าว่าง เช่น "ทุกจังหวัด" — ไม่ระบุ = ต้องเลือกค่าใดค่าหนึ่ง */
  emptyLabel?: string;
  className?: string;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setMounted(true), []);

  const all = useMemo(() => (emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...options] : options), [options, emptyLabel]);
  const selected = all.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().startsWith(q) || o.group?.toLowerCase().includes(q));
  }, [all, query]);

  // ปิดเมื่อคลิกนอกกล่อง
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // เปิดแล้ว: โฟกัสช่องค้นหา + เลื่อนไปยังตัวที่เลือกอยู่
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const i = Math.max(0, filtered.findIndex((o) => o.value === value));
    setActive(i);
    listRef.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (o: SelectOption) => {
    setValue(o.value);
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(filtered.length - 1, a + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
    else if (e.key === "Enter") {
      e.preventDefault(); // ไม่ส่งฟอร์มตอนกด Enter เลือกตัวเลือก
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === "Escape") (e.preventDefault(), setOpen(false));
  };

  // ก่อน hydrate: <select> ธรรมดา
  if (!mounted) {
    const groups = new Map<string, SelectOption[]>();
    for (const o of options) groups.set(o.group ?? "", [...(groups.get(o.group ?? "") ?? []), o]);
    return (
      <select id={inputId} name={name} defaultValue={defaultValue} className={className}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {[...groups].map(([g, list]) =>
          g ? (
            <optgroup key={g} label={g}>
              {list.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            list.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
    );
  }

  let lastGroup: string | undefined;
  return (
    <div ref={boxRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        id={inputId}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") (e.preventDefault(), setOpen(true));
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${className} flex w-full items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">{selected?.label ?? emptyLabel ?? "เลือก"}</span>
        <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true" fill="currentColor" className="shrink-0 text-wiki-muted">
          <path d="M5 7l5 6 5-6z" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-full min-w-64 border border-wiki-border bg-white shadow-lg">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => (setQuery(e.target.value), setActive(0))}
            onKeyDown={onKey}
            placeholder="พิมพ์เพื่อค้นหา…"
            aria-label="ค้นหาตัวเลือก"
            className="w-full border-b border-wiki-border px-2 py-1.5 outline-none"
          />
          <ul ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-wiki-muted">ไม่พบตัวเลือก</li>}
            {filtered.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <li key={o.value || "__empty"}>
                  {header && <div className="px-3 pt-2 pb-1 text-xs font-bold text-wiki-muted">{header}</div>}
                  <div
                    data-i={i}
                    role="option"
                    aria-selected={o.value === value}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => (e.preventDefault(), choose(o))}
                    className={`cursor-pointer px-3 py-1 ${o.group ? "pl-5" : ""} ${i === active ? "bg-wiki-link text-white" : ""} ${
                      o.value === value && i !== active ? "font-bold" : ""
                    }`}
                  >
                    {o.label}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
