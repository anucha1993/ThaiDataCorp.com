import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgencyFields, FilterBox, MemberLock } from "@/components/FilterForms";
import { getProvider } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { agencyUrl, formatMillionBaht, formatNumber } from "@/lib/format";
import { agencyQuery, listContractProvinces, parseAgencyFilters, searchAgencies } from "@/lib/procurement-search";

export const metadata: Metadata = {
  title: "ค้นหาหน่วยงานรัฐ",
  robots: { index: false, follow: true },
  alternates: { canonical: "/agency/search" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PAGE_SIZE = 50;

export default async function AgencySearchPage({ searchParams }: Props) {
  if (getProvider() !== "db") notFound();
  const sp = await searchParams;
  const f = parseAgencyFilters(sp);
  const page = Math.max(1, Math.min(500, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1));
  const [user, provinces] = await Promise.all([getCurrentUser(), listContractProvinces()]);
  const self = `/agency/search?${agencyQuery(f)}`;
  const result = user ? await searchAgencies(f, page, PAGE_SIZE) : null;
  const pages = result ? Math.ceil(result.total / PAGE_SIZE) : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › <Link href="/agency">หน่วยงานรัฐ</Link> › ค้นหา
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem]">ค้นหาหน่วยงานรัฐ</h1>
        <p className="mt-3 text-sm leading-6 text-wiki-muted">
          หน่วยงานภาครัฐที่ทำสัญญาจัดซื้อจัดจ้างกับนิติบุคคล ปีงบประมาณ 2568 ทั้งหมดราว 29,000 หน่วยงาน
        </p>

        <FilterBox title="ตัวกรองหน่วยงาน" action="/agency/search" exportAction="/export/agencies">
          <AgencyFields f={f} provinces={provinces} />
        </FilterBox>

        {!result ? (
          <MemberLock next={self} what="การค้นหาและดาวน์โหลดรายชื่อหน่วยงานรัฐ" />
        ) : result.rows.length === 0 ? (
          <p className="text-wiki-muted">ไม่พบหน่วยงานตามเงื่อนไข</p>
        ) : (
          <>
            <p className="mb-2 flex flex-wrap gap-x-4 text-sm">
              <span className="text-wiki-muted">
                พบ {formatNumber(result.total)} หน่วยงาน{pages > 1 && ` · หน้า ${page} / ${formatNumber(pages)}`}
              </span>
              <a href={`/export/agencies?${agencyQuery(f)}`} rel="nofollow" className="font-bold">
                ⬇ ดาวน์โหลดผลเป็น CSV
              </a>
            </p>
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
                    <th scope="col">จังหวัดหลัก</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((a, i) => (
                    <tr key={a.agency}>
                      <td className="text-center tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td>
                        <Link href={agencyUrl(a.agency)}>{a.agency}</Link>
                      </td>
                      <td className="text-right tabular-nums">{formatNumber(Number(a.contracts))}</td>
                      <td className="text-right whitespace-nowrap tabular-nums">{formatMillionBaht(Number(a.total_value))}</td>
                      <td className="text-right tabular-nums">{formatNumber(Number(a.winners))}</td>
                      <td className="text-right tabular-nums">
                        {Number(a.contracts) > 0 ? `${((Number(a.ebid_contracts) / Number(a.contracts)) * 100).toFixed(0)}%` : "-"}
                      </td>
                      <td>{a.top_province ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <nav aria-label="หน้า" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                {page > 1 && <Link href={`/agency/search?${agencyQuery(f, { page: String(page - 1) })}`}>← ก่อนหน้า</Link>}
                <span className="text-wiki-muted">
                  หน้า {page} / {formatNumber(pages)}
                </span>
                {page < pages && page < 500 && <Link href={`/agency/search?${agencyQuery(f, { page: String(page + 1) })}`}>ถัดไป →</Link>}
              </nav>
            )}
          </>
        )}
      </article>
    </main>
  );
}
