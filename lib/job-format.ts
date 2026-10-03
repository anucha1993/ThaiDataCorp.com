import { formatNumber } from "@/lib/format";

/** เงินเดือนสำหรับแสดงผล เช่น "15,000 – 25,000 บาท" / "ตามตกลง" */
export function salaryText(min: number | null, max: number | null, note: string | null): string {
  const range =
    min !== null && max !== null
      ? `${formatNumber(min)} – ${formatNumber(max)} บาท`
      : min !== null
        ? `${formatNumber(min)} บาทขึ้นไป`
        : max !== null
          ? `ไม่เกิน ${formatNumber(max)} บาท`
          : "";
  return [range, note].filter(Boolean).join(" · ") || "ตามตกลง";
}
