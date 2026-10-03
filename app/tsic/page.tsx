import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProvider } from "@/lib/api";
import { formatNumber, SITE_NAME, tsicUrl } from "@/lib/format";
import { getTsicTree } from "@/lib/tsic-repo";
import { CompanyFields, FilterBox, fieldCls, tsicDivisionOptions } from "@/components/FilterForms";
import SearchableSelect from "@/components/SearchableSelect";
import { listProvinces, listTsicDivisions } from "@/lib/search-repo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "ประเภทธุรกิจ (TSIC) — รายชื่อนิติบุคคลแยกตามประเภทธุรกิจ",
  description:
    "เรียกดูรายชื่อบริษัทและห้างหุ้นส่วนในประเทศไทย แยกตามประเภทธุรกิจตามการจัดประเภทมาตรฐานอุตสาหกรรมประเทศไทย (TSIC 2552) พร้อมจำนวนนิติบุคคลในแต่ละหมวด",
  alternates: { canonical: "/tsic" },
};

export default async function TsicIndexPage() {
  if (getProvider() !== "db") notFound();
  const [tree, divisions, provinces] = await Promise.all([getTsicTree(), listTsicDivisions(), listProvinces()]);
  const total = tree.reduce((s, x) => s + x.count, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › ประเภทธุรกิจ
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">ประเภทธุรกิจ (TSIC)</h1>
        <p className="mt-3 leading-7">
          รายชื่อนิติบุคคลใน {SITE_NAME} จำนวน {formatNumber(total)} ราย แยกตาม
          <b>การจัดประเภทมาตรฐานอุตสาหกรรมประเทศไทย (TSIC 2552)</b> ของสำนักงานสถิติแห่งชาติ ทั้งหมด {tree.length} หมวดใหญ่
          เลือกประเภทธุรกิจเพื่อดูจำนวนนิติบุคคลแยกตามจังหวัดและรายชื่อบริษัท
        </p>

        <FilterBox title="ค้นหา / ดาวน์โหลดรายชื่อบริษัทตามประเภทธุรกิจ" action="/search" exportAction="/export/search">
          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            ประเภทธุรกิจ (หมวด TSIC)
            <SearchableSelect name="tsic" options={tsicDivisionOptions(divisions)} emptyLabel="ทุกประเภท" className={fieldCls} />
          </label>
          <CompanyFields provinces={provinces} />
        </FilterBox>

        <nav aria-labelledby="toc-h" className="my-5 inline-block border border-wiki-border bg-wiki-bg px-4 py-2 text-sm">
          <h2 id="toc-h" className="mb-1 text-center font-bold">
            สารบัญ
          </h2>
          <ol className="list-none space-y-0.5">
            {tree.map((s) => (
              <li key={s.node.code}>
                <a href={`#section-${s.node.code}`}>
                  <span className="mr-2 font-mono text-wiki-text">{s.node.code}</span>
                  {s.node.name.trim()}
                </a>{" "}
                <span className="text-wiki-muted">({formatNumber(s.count)})</span>
              </li>
            ))}
          </ol>
        </nav>

        {tree.map((s) => (
          <section key={s.node.code} id={`section-${s.node.code}`} aria-labelledby={`h-${s.node.code}`}>
            <h2 id={`h-${s.node.code}`} className="wiki-h2">
              หมวดใหญ่ {s.node.code}: {s.node.name.trim()}{" "}
              <span className="text-base text-wiki-muted">({formatNumber(s.count)} ราย)</span>
            </h2>
            {s.divisions.map((d) => (
              <div key={d.node.code} className="mb-4">
                <h3 className="mb-1 font-bold">
                  <span className="font-mono">{d.node.code}</span> {d.node.name.trim()}{" "}
                  <span className="font-normal text-wiki-muted">({formatNumber(d.count)})</span>
                </h3>
                <ul className="grid gap-x-6 gap-y-0.5 pl-5 text-sm sm:grid-cols-2">
                  {d.codes.map((c) => (
                    <li key={c.node.code} className="list-disc">
                      <Link href={tsicUrl(c.node.code)}>{c.node.name.trim()}</Link>{" "}
                      <span className="text-wiki-muted">({formatNumber(c.count)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}
