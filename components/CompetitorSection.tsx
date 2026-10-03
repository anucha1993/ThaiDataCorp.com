import Link from "next/link";
import type { CompetitorInfo } from "@/lib/competitor-repo";
import { agencyUrl, formatBaht, formatNumber } from "@/lib/format";

const pct = (v: number | null) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);

/** วิเคราะห์คู่แข่งและราคางานภาครัฐ (ต่อจากส่วนงานภาครัฐบนหน้าบริษัท) */
export default function CompetitorSection({ info }: { info: CompetitorInfo }) {
  const { price } = info;
  return (
    <section id="competitors" aria-labelledby="competitors-h">
      <h2 id="competitors-h" className="wiki-h2">
        คู่แข่งและราคางานภาครัฐ
      </h2>

      <ul className="mb-3 list-disc space-y-0.5 pl-6 text-sm">
        {price.discount != null && price.priced > 0 && (
          <li>
            ราคาที่ได้งาน{price.discount >= 0 ? "ต่ำกว่า" : "สูงกว่า"}ราคากลางเฉลี่ย <b>{pct(Math.abs(price.discount))}</b> (จาก{" "}
            {formatNumber(price.priced)} สัญญาที่มีราคากลาง)
          </li>
        )}
        {price.priced > 0 && (
          <li>
            ราคาเท่ากับราคากลางพอดี {formatNumber(price.equal)} สัญญา ({pct(price.equal / price.priced)})
          </li>
        )}
        {price.total > 0 && (
          <li>
            ได้งานด้วยวิธี e-bidding / ประกวดราคา {formatNumber(price.ebid)} จาก {formatNumber(price.total)} สัญญา ({pct(price.ebid / price.total)})
          </li>
        )}
      </ul>

      <h3 className="mt-4 mb-1 font-bold">ตำแหน่งในหน่วยงานหลัก</h3>
      <div className="overflow-x-auto">
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">หน่วยงาน</th>
              <th scope="col">สัญญา</th>
              <th scope="col">มูลค่า</th>
              <th scope="col">อันดับในหน่วยงาน</th>
              <th scope="col" title="ส่วนต่างจากราคากลางเฉลี่ย: บริษัทนี้ / ผู้ชนะทุกรายในหน่วยงาน">
                ต่ำกว่าราคากลาง (บริษัท / เฉลี่ยหน่วยงาน)
              </th>
            </tr>
          </thead>
          <tbody>
            {info.positions.map((p) => (
              <tr key={p.agency}>
                <td>
                  <Link href={agencyUrl(p.agency)}>{p.agency}</Link>
                </td>
                <td className="text-right tabular-nums">{formatNumber(p.contracts)}</td>
                <td className="text-right whitespace-nowrap tabular-nums">{formatBaht(p.value)}</td>
                <td className="whitespace-nowrap tabular-nums">
                  {formatNumber(p.rank)} จาก {formatNumber(p.winners)} ราย
                </td>
                <td className="whitespace-nowrap tabular-nums">
                  {pct(p.discount)} / {pct(p.agencyDiscount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {info.competitors.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 font-bold">นิติบุคคลอื่นที่ได้งานจากหน่วยงานเดียวกัน</h3>
          <div className="overflow-x-auto">
            <table className="wikitable">
              <thead>
                <tr>
                  <th scope="col">นิติบุคคล</th>
                  <th scope="col">หน่วยงานที่ตรงกัน</th>
                  <th scope="col">สัญญา</th>
                  <th scope="col">มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {info.competitors.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/company/${c.id}`}>{c.name}</Link>
                      {c.sameDivision && <span className="ml-1 text-xs text-wiki-muted">· ธุรกิจหมวดเดียวกัน</span>}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatNumber(c.sharedAgencies)} / {formatNumber(info.positions.length)}
                    </td>
                    <td className="text-right tabular-nums">{formatNumber(c.contracts)}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{formatBaht(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-2 text-xs text-wiki-muted">
        คำนวณอัตโนมัติจากสัญญาในระบบ e-GP (กรมบัญชีกลาง) — &ldquo;หน่วยงานเดียวกัน&rdquo; ไม่ได้หมายความว่ายื่นประมูลแข่งกันในโครงการเดียวกัน
        และส่วนต่างจากราคากลางเป็นตัวเลขข้อเท็จจริง ไม่ใช่การประเมินความผิดปกติ
      </p>
    </section>
  );
}
