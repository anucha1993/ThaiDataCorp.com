import Link from "next/link";
import { agencyUrl, formatBaht, formatNumber, formatThaiDate, SITE_NAME } from "@/lib/format";
import type { ProcurementSummary } from "@/types/company";

/** ส่วน "งานจัดซื้อจัดจ้างภาครัฐ" ในหน้าบริษัท (ข้อมูล e-GP) */
export default function ProcurementSection({
  data,
  exportHref,
  exportNote,
}: {
  data: ProcurementSummary;
  exportHref?: string;
  exportNote?: string;
}) {
  const years = data.fiscalYears.length
    ? data.fiscalYears.length === 1
      ? `ปีงบประมาณ ${data.fiscalYears[0]}`
      : `ปีงบประมาณ ${data.fiscalYears[0]}–${data.fiscalYears[data.fiscalYears.length - 1]}`
    : "";

  return (
    <section id="procurement" aria-labelledby="procurement-h">
      <h2 id="procurement-h" className="wiki-h2">
        งานจัดซื้อจัดจ้างภาครัฐ
      </h2>
      <p className="text-[0.95rem] leading-7">
        ใน{years} นิติบุคคลนี้ได้รับสัญญาจัดซื้อจัดจ้างจากหน่วยงานภาครัฐ <b>{formatNumber(data.contracts)} สัญญา</b> มูลค่ารวม{" "}
        <b>{formatBaht(data.totalValue)}</b> จาก {formatNumber(data.agencies)} หน่วยงาน
        {data.firstSign && data.lastSign && (
          <>
            {" "}
            ลงนามสัญญาระหว่างวันที่ {formatThaiDate(data.firstSign)} ถึง {formatThaiDate(data.lastSign)}
          </>
        )}
      </p>

      {data.topAgencies.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="wikitable">
            <caption>หน่วยงานที่ทำสัญญามากที่สุด (ตามมูลค่า)</caption>
            <thead>
              <tr>
                <th scope="col">หน่วยงาน</th>
                <th scope="col">จำนวนสัญญา</th>
                <th scope="col">มูลค่ารวม (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {data.topAgencies.map((a) => (
                <tr key={a.agency}>
                  <td>
                    <Link href={agencyUrl(a.agency)}>{a.agency}</Link>
                  </td>
                  <td className="text-right tabular-nums">{formatNumber(a.contracts)}</td>
                  <td className="text-right tabular-nums">{formatNumber(a.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="wikitable">
          <caption>
            สัญญาล่าสุด {data.latest.length < data.contracts ? `(${data.latest.length} จาก ${formatNumber(data.contracts)} สัญญา)` : ""}
          </caption>
          <thead>
            <tr>
              <th scope="col">วันที่ลงนาม</th>
              <th scope="col">โครงการ</th>
              <th scope="col">หน่วยงาน</th>
              <th scope="col">วิธีจัดซื้อ</th>
              <th scope="col">มูลค่าสัญญา (บาท)</th>
              <th scope="col">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {data.latest.map((c, i) => (
              <tr key={`${c.fiscalYear}-${i}`}>
                <td className="whitespace-nowrap">{formatThaiDate(c.signDate)}</td>
                <td className="min-w-[16rem]">{c.projectName}</td>
                <td className="min-w-[10rem]">
                  <Link href={agencyUrl(c.agency)}>{c.agency}</Link>
                  {c.province && <span className="block text-xs text-wiki-muted">{c.province}</span>}
                </td>
                <td className="whitespace-nowrap">{c.method ?? "-"}</td>
                <td className="text-right whitespace-nowrap tabular-nums">{formatNumber(c.value)}</td>
                <td className="whitespace-nowrap">{c.status ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {exportHref && (
        <p className="mt-2 text-sm">
          <a href={exportHref} rel="nofollow">
            ⬇ ดาวน์โหลดสัญญาทั้งหมดเป็น CSV
          </a>{" "}
          <span className="text-xs text-wiki-muted">{exportNote}</span>
        </p>
      )}
      <p className="mt-2 text-xs text-wiki-muted">
        ที่มา: ระบบการจัดซื้อจัดจ้างภาครัฐ (e-GP) เผยแพร่โดยสำนักงานพัฒนารัฐบาลดิจิทัลบน data.go.th — {SITE_NAME}{" "}
        แสดงเฉพาะสัญญาที่ระบุเลขนิติบุคคลของผู้ชนะ
      </p>
    </section>
  );
}
