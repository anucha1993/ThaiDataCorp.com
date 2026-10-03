import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { formatNumber, formatThaiDate } from "@/lib/format";
import type { SameAddressInfo } from "@/types/company";

/** นิติบุคคลอื่นที่จดทะเบียนที่อยู่เดียวกันทุกตัวอักษร */
export default function SameAddressSection({ data }: { data: SameAddressInfo }) {
  return (
    <section id="same-address" aria-labelledby="same-address-h">
      <h2 id="same-address-h" className="wiki-h2">
        นิติบุคคลที่จดทะเบียนที่อยู่เดียวกัน
      </h2>
      <p className="mb-2 text-sm">
        พบนิติบุคคลอื่น {formatNumber(data.total)} รายที่จดทะเบียนสำนักงานใหญ่ที่อยู่เดียวกัน
        {data.total > data.companies.length && ` (แสดง ${data.companies.length} รายการ)`}
      </p>
      <div className="overflow-x-auto">
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">ชื่อนิติบุคคล</th>
              <th scope="col">วันจดทะเบียน</th>
              <th scope="col">สถานะ</th>
              <th scope="col">สัญญาภาครัฐ</th>
            </tr>
          </thead>
          <tbody>
            {data.companies.map(({ profile: p, govContracts }) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/company/${p.id}`}>{p.nameTh}</Link>
                </td>
                <td className="whitespace-nowrap">{formatThaiDate(p.registerDate)}</td>
                <td className="whitespace-nowrap">
                  <StatusBadge status={p.status} text={p.statusText} />
                </td>
                <td className="text-right tabular-nums">{govContracts > 0 ? formatNumber(govContracts) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
