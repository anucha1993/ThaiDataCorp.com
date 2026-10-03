import Link from "next/link";
import { formatNumber } from "@/lib/format";
import type { WinnerRank } from "@/lib/procurement-repo";

/** ตารางจัดอันดับผู้รับสัญญาภาครัฐ */
export default function WinnerTable({ winners, caption }: { winners: WinnerRank[]; caption?: string }) {
  const total = winners.reduce((s, w) => s + w.value, 0);
  return (
    <div className="overflow-x-auto">
      <table className="wikitable">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            <th scope="col" className="w-12">
              อันดับ
            </th>
            <th scope="col">ผู้รับสัญญา</th>
            <th scope="col">จำนวนสัญญา</th>
            <th scope="col">มูลค่ารวม (บาท)</th>
            <th scope="col">สัดส่วน</th>
          </tr>
        </thead>
        <tbody>
          {winners.map((w, i) => (
            <tr key={w.id}>
              <td className="text-center tabular-nums">{i + 1}</td>
              <td>
                {/* ลิงก์ได้ทุกราย — ถ้ายังไม่มีใน DB หน้าบริษัทจะดึงข้อมูลจาก DBD Open API ให้ */}
                <Link href={`/company/${w.id}`}>{w.name}</Link>
              </td>
              <td className="text-right tabular-nums">{formatNumber(w.contracts)}</td>
              <td className="text-right tabular-nums">{formatNumber(w.value)}</td>
              <td className="text-right tabular-nums">{total > 0 ? `${((w.value / total) * 100).toFixed(1)}%` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
