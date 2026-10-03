import Link from "next/link";
import { formatBaht, tsicUrl } from "@/lib/format";
import type { ChangeField } from "@/lib/changes-repo";

/** แสดงค่าก่อน/หลังของการเปลี่ยนแปลงให้อ่านง่าย (ทุนเป็นบาท รหัส TSIC เป็นลิงก์) */
export default function ChangeValue({ field, oldValue, newValue }: { field: ChangeField; oldValue: string | null; newValue: string | null }) {
  const fmt = (v: string | null) => {
    if (v == null || v === "") return <span className="text-wiki-muted">-</span>;
    if (field === "capital") return formatBaht(Number(v));
    if (field === "tsic") return <Link href={tsicUrl(v)}>{v}</Link>;
    return v;
  };
  const diff =
    field === "capital" && oldValue && newValue ? Number(newValue) - Number(oldValue) : null;
  return (
    <>
      <span className="text-wiki-muted line-through decoration-wiki-muted/60">{fmt(oldValue)}</span>
      <span aria-hidden="true"> → </span>
      <span className="sr-only"> เปลี่ยนเป็น </span>
      <b>{fmt(newValue)}</b>
      {diff != null && diff !== 0 && (
        <span className={`ml-1 text-xs ${diff > 0 ? "text-green-800" : "text-red-800"}`}>
          ({diff > 0 ? "+" : "−"}
          {formatBaht(Math.abs(diff))})
        </span>
      )}
    </>
  );
}
