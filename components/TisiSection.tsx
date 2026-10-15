import { formatNumber, formatThaiDate } from "@/lib/format";
import type { TisiInfo } from "@/lib/tisi-repo";

export const TISI_DATASET_URL = "https://data.go.th/dataset/lic_tis_total";

/** ใบอนุญาต มอก. บนหน้าบริษัท (แสดงเฉพาะเมื่อมี) */
export default function TisiSection({ tisi, compact = false }: { tisi: TisiInfo; compact?: boolean }) {
  if (!tisi.total) return null;
  const shown = tisi.licenses.length;
  return (
    <section id="tisi" aria-labelledby="tisi-h">
      <h2 id="tisi-h" className={compact ? "mt-6 mb-2 border-b border-wiki-border pb-1 font-serif text-lg" : "wiki-h2"}>
        ใบอนุญาตมาตรฐานผลิตภัณฑ์อุตสาหกรรม (มอก.)
      </h2>
      <p className="mb-2 text-sm">
        ได้รับใบอนุญาต มอก. {formatNumber(tisi.total)} ฉบับ{tisi.total > shown && ` (แสดง ${formatNumber(shown)} ฉบับล่าสุด)`}
      </p>
      <div className="overflow-x-auto">
        <table className={`wikitable w-full ${compact ? "text-xs" : ""}`}>
          <thead>
            <tr>
              <th scope="col">มาตรฐาน (มอก.)</th>
              <th scope="col">ใบอนุญาต</th>
              <th scope="col">ออกเมื่อ</th>
              <th scope="col">โรงงาน</th>
            </tr>
          </thead>
          <tbody>
            {tisi.licenses.map((l) => (
              <tr key={l.licenseNo}>
                <td>
                  {l.tisName ?? "-"}
                  {l.tisNo && <div className="font-mono text-xs text-wiki-muted">มอก. {l.tisNo}</div>}
                </td>
                <td className="whitespace-nowrap">
                  <span className="font-mono text-xs">{l.licenseNo}</span>
                  {l.licenseType && <div className="text-xs text-wiki-muted">{l.licenseType}</div>}
                </td>
                <td className="whitespace-nowrap">{formatThaiDate(l.issuedDate)}</td>
                <td className="text-sm">
                  {l.factoryName ?? "-"}
                  {l.province && <div className="text-xs text-wiki-muted">{l.province}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-wiki-muted">
        ที่มา: สำนักงานมาตรฐานผลิตภัณฑ์อุตสาหกรรม (สมอ.){" "}
        <a href={TISI_DATASET_URL} rel="noopener nofollow" target="_blank">
          รายชื่อผู้รับใบอนุญาตมาตรฐานผลิตภัณฑ์อุตสาหกรรม
        </a>{" "}
        (data.go.th, CC-BY){tisi.sourceDate && ` ข้อมูลล่าสุด ${formatThaiDate(tisi.sourceDate)}`} — ตรวจสถานะใบอนุญาตปัจจุบันได้ที่ สมอ.
      </p>
    </section>
  );
}
