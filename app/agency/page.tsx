import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProvider } from "@/lib/api";
import { agencyUrl, formatMillionBaht, formatNumber, SITE_NAME } from "@/lib/format";
import { listTopAgencies } from "@/lib/procurement-repo";
import { AgencyFields, FilterBox } from "@/components/FilterForms";
import { listContractProvinces } from "@/lib/procurement-search";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "หน่วยงานรัฐที่จัดซื้อจัดจ้างมากที่สุด ปีงบประมาณ 2568",
  description:
    "รายชื่อหน่วยงานภาครัฐเรียงตามมูลค่าสัญญาจัดซื้อจัดจ้างกับนิติบุคคล ปีงบประมาณ 2568 พร้อมจำนวนสัญญา จำนวนผู้รับสัญญา และสัดส่วนการประกวดราคา",
  alternates: { canonical: "/agency" },
};

export default async function AgencyIndexPage() {
  if (getProvider() !== "db") notFound();
  const [agencies, provinces] = await Promise.all([listTopAgencies(500), listContractProvinces()]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › หน่วยงานรัฐ
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">
          หน่วยงานรัฐที่จัดซื้อจัดจ้างมากที่สุด
        </h1>
        <p className="mt-3 mb-4 leading-7">
          {agencies.length} หน่วยงานภาครัฐที่มีมูลค่าสัญญาจัดซื้อจัดจ้างกับนิติบุคคลสูงสุดในปีงบประมาณ 2568 จากข้อมูลระบบ e-GP
          ดูอันดับ <Link href="/procurement">บริษัทที่ได้งานภาครัฐมากที่สุด</Link> ได้ใน {SITE_NAME}
        </p>
        <FilterBox title="ค้นหา / กรอง / ดาวน์โหลดรายชื่อหน่วยงาน (ทั้งหมดราว 29,000 หน่วยงาน)" action="/agency/search" exportAction="/export/agencies">
          <AgencyFields provinces={provinces} />
        </FilterBox>
        <div className="overflow-x-auto">
          <table className="wikitable">
            <thead>
              <tr>
                <th scope="col" className="w-12">
                  อันดับ
                </th>
                <th scope="col">หน่วยงาน</th>
                <th scope="col">สัญญา</th>
                <th scope="col">มูลค่ารวม</th>
                <th scope="col">ผู้รับสัญญา</th>
                <th scope="col">ประกวดราคา</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a, i) => (
                <tr key={a.agency}>
                  <td className="text-center tabular-nums">{i + 1}</td>
                  <td>
                    <Link href={agencyUrl(a.agency)}>{a.agency}</Link>
                  </td>
                  <td className="text-right tabular-nums">{formatNumber(a.contracts)}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatMillionBaht(a.totalValue)}</td>
                  <td className="text-right tabular-nums">{formatNumber(a.winners)}</td>
                  <td className="text-right tabular-nums">
                    {a.contracts > 0 ? `${((a.ebidContracts / a.contracts) * 100).toFixed(0)}%` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </main>
  );
}
