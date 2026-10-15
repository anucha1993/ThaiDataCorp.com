import Link from "next/link";
import LeadAlertButton from "@/components/LeadAlertButton";
import StatusBadge from "@/components/StatusBadge";
import { formatBaht, formatNumber, formatThaiDate, inProvince, tsicUrl } from "@/lib/format";
import { listRelatedCompanies } from "@/lib/company-repo";

/** บริษัทอื่นที่ทำธุรกิจเดียวกันในจังหวัดเดียวกัน (ล่าสุดก่อน) + ลิงก์ดูทั้งหมด + ปุ่มแจ้งเตือนบริษัทใหม่ */
export default async function RelatedCompanies({
  id,
  tsicCode,
  tsicName,
  province,
}: {
  id: string;
  tsicCode: string;
  tsicName: string;
  province: string;
}) {
  const { rows, total } = await listRelatedCompanies(id, tsicCode, province, 8).catch(() => ({ rows: [], total: 0 }));
  if (!rows.length) return null;
  return (
    <section id="related" aria-labelledby="related-h">
      <h2 id="related-h" className="wiki-h2">
        ธุรกิจเดียวกัน{inProvince(province)}
      </h2>
      <p className="mb-2 text-sm">
        {tsicName} {inProvince(province)} มีนิติบุคคลที่ยังดำเนินกิจการ {formatNumber(total)} ราย — ล่าสุด:
      </p>
      <ul className="divide-y divide-wiki-border-light border border-wiki-border-light">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm">
            <Link href={`/company/${c.id}`} className="font-bold">
              {c.nameTh}
            </Link>
            <span className="text-xs text-wiki-muted">
              จดทะเบียน {formatThaiDate(c.registerDate)} · ทุน {formatBaht(c.registerCapital)}
            </span>
            <StatusBadge status={c.status} text={c.statusText} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <Link href={tsicUrl(tsicCode, province)}>
          ดูทั้งหมด {formatNumber(total)} ราย →
        </Link>
        <LeadAlertButton tsicCode={tsicCode} province={province} label={`แจ้งเตือนเมื่อมีบริษัทเปิดใหม่ในธุรกิจนี้${inProvince(province)}`} />
      </div>
    </section>
  );
}
