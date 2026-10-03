import { formatNumber, formatThaiDate } from "@/lib/format";
import type { VatInfo } from "@/lib/vat-repo";

export const VAT_DATASET_URL = "https://data.go.th/dataset/vat_taxpayeraddress_10_01";

/** ค่าในช่อง "ภาษีมูลค่าเพิ่ม" ของ Infobox */
export function VatInfoboxValue({ vat }: { vat: VatInfo }) {
  if (!vat.registered) {
    return (
      <span className="text-wiki-muted" title="กิจการที่รายได้ไม่เกิน 1.8 ล้านบาทต่อปีไม่จำเป็นต้องจด VAT">
        ไม่พบในทะเบียน VAT
      </span>
    );
  }
  return (
    <a href="#vat">
      <span className="text-green-800">✔ จดทะเบียนแล้ว</span>
      {vat.since && (
        <>
          <br />
          ตั้งแต่ {formatThaiDate(vat.since)}
        </>
      )}
      {vat.totalBranches > 1 && (
        <>
          <br />
          {formatNumber(vat.totalBranches)} สถานประกอบการ
        </>
      )}
    </a>
  );
}

/** ส่วน "ภาษีมูลค่าเพิ่มและสาขา" บนหน้าบริษัท — แสดงเฉพาะที่จด VAT */
export default function VatSection({ vat }: { vat: VatInfo }) {
  if (!vat.registered) return null;
  const shown = vat.branches.length;
  return (
    <section id="vat" aria-labelledby="vat-h">
      <h2 id="vat-h" className="wiki-h2">
        ภาษีมูลค่าเพิ่มและสาขา
      </h2>
      <p className="mb-2 text-sm">
        จดทะเบียนภาษีมูลค่าเพิ่ม (ภ.พ.20){vat.since && ` ตั้งแต่ ${formatThaiDate(vat.since)}`} มีสถานประกอบการที่จด VAT{" "}
        {formatNumber(vat.totalBranches)} แห่ง{vat.totalBranches > shown && ` (แสดง ${formatNumber(shown)} แห่งแรก)`}
      </p>
      <div className="overflow-x-auto">
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">สาขา</th>
              <th scope="col">ชื่อสถานประกอบการ / ที่ตั้ง</th>
              <th scope="col">จด VAT เมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {vat.branches.map((b) => (
              <tr key={b.branchNo}>
                <td className="whitespace-nowrap">{b.branchNo === 0 ? "สำนักงานใหญ่" : `สาขา ${String(b.branchNo).padStart(5, "0")}`}</td>
                <td>
                  {b.name && <div className="font-bold">{b.name}</div>}
                  <div className="text-sm">{b.address ?? "-"}</div>
                </td>
                <td className="whitespace-nowrap">{b.approvedDate ? formatThaiDate(b.approvedDate) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-wiki-muted">
        ที่มา: กรมสรรพากร{" "}
        <a href={VAT_DATASET_URL} rel="noopener nofollow" target="_blank">
          รายชื่อผู้ประกอบการจดทะเบียนภาษีมูลค่าเพิ่ม
        </a>{" "}
        (data.go.th, Open Data Common){vat.sourceDate && ` ข้อมูล ณ ${formatThaiDate(vat.sourceDate)}`} — เฉพาะผู้ที่ยังประกอบกิจการอยู่
        ตรวจสถานะล่าสุดได้ที่ระบบตรวจสอบผู้ประกอบการของกรมสรรพากร
      </p>
    </section>
  );
}
