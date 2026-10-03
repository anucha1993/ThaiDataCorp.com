import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { formatBaht, formatThaiDate, tsicUrl } from "@/lib/format";
import type { JuristicProfile } from "@/types/company";

/** ตารางรายชื่อนิติบุคคลแบบ wikitable — ใช้ในหน้าประเภทธุรกิจ/จังหวัด */
export default function CompanyTable({
  companies,
  caption,
  showProvince = true,
  showTsic = false,
}: {
  companies: JuristicProfile[];
  caption?: string;
  showProvince?: boolean;
  /** แสดงคอลัมน์ประเภทธุรกิจ (ลิงก์ไปหน้า /tsic) */
  showTsic?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="wikitable">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">ชื่อนิติบุคคล</th>
            <th scope="col">เลขทะเบียน</th>
            <th scope="col">วันจดทะเบียน</th>
            <th scope="col">ทุนจดทะเบียน</th>
            {showTsic && <th scope="col">ประเภทธุรกิจ</th>}
            {showProvince && <th scope="col">จังหวัด</th>}
            <th scope="col">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((p) => (
            <tr key={p.id}>
              <td>
                <Link href={`/company/${p.id}`}>{p.nameTh}</Link>
              </td>
              <td className="font-mono whitespace-nowrap tabular-nums">{p.id}</td>
              <td className="whitespace-nowrap">{formatThaiDate(p.registerDate)}</td>
              <td className="text-right whitespace-nowrap tabular-nums">{formatBaht(p.registerCapital)}</td>
              {showTsic && (
                <td className="min-w-[12rem] text-[0.8rem]">
                  {p.tsic ? <Link href={tsicUrl(p.tsic.code)}>{p.tsic.description}</Link> : "-"}
                </td>
              )}
              {showProvince && <td>{p.address.province ?? "-"}</td>}
              <td className="whitespace-nowrap">
                <StatusBadge status={p.status} text={p.statusText} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
