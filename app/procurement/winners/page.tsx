import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterBox, MemberLock, WinnerFields } from "@/components/FilterForms";
import { getProvider } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { formatMillionBaht, formatNumber, formatThaiDate } from "@/lib/format";
import { listContractProvinces, parseWinnerFilters, searchWinners, winnerQuery } from "@/lib/procurement-search";

export const metadata: Metadata = {
  title: "ค้นหาผู้รับงานภาครัฐ",
  robots: { index: false, follow: true },
  alternates: { canonical: "/procurement/winners" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PAGE_SIZE = 50;

export default async function WinnerSearchPage({ searchParams }: Props) {
  if (getProvider() !== "db") notFound();
  const sp = await searchParams;
  const f = parseWinnerFilters(sp);
  const page = Math.max(1, Math.min(500, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1));
  const [user, provinces] = await Promise.all([getCurrentUser(), listContractProvinces()]);
  const self = `/procurement/winners?${winnerQuery(f)}`;
  const result = user ? await searchWinners(f, page, PAGE_SIZE) : null;
  const pages = result ? Math.ceil(result.total / PAGE_SIZE) : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › <Link href="/procurement">ผู้รับงานภาครัฐ</Link> › ค้นหาผู้รับสัญญา
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem]">ค้นหาผู้รับงานภาครัฐ</h1>
        <p className="mt-3 text-sm leading-6 text-wiki-muted">
          นิติบุคคลที่ได้รับสัญญาจัดซื้อจัดจ้างภาครัฐ ปีงบประมาณ 2568 — เลือกจังหวัดเพื่อดูยอดเฉพาะโครงการในจังหวัดนั้น ·{" "}
          <Link href="/procurement/contracts">ค้นหารายสัญญา</Link>
        </p>

        <FilterBox title="ตัวกรองผู้รับสัญญา" action="/procurement/winners" exportAction="/export/winners">
          <WinnerFields f={f} provinces={provinces} />
        </FilterBox>

        {!result ? (
          <MemberLock next={self} what="การค้นหาและดาวน์โหลดรายชื่อผู้รับงานภาครัฐ" />
        ) : result.rows.length === 0 ? (
          <p className="text-wiki-muted">ไม่พบผู้รับสัญญาตามเงื่อนไข</p>
        ) : (
          <>
            <p className="mb-2 flex flex-wrap gap-x-4 text-sm">
              <span className="text-wiki-muted">
                พบ {formatNumber(result.total)} ราย{pages > 1 && ` · หน้า ${page} / ${formatNumber(pages)}`}
              </span>
              <a href={`/export/winners?${winnerQuery(f)}`} rel="nofollow" className="font-bold">
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
                    <th scope="col">ผู้รับสัญญา</th>
                    <th scope="col">สัญญา{f.province ? ` (${f.province})` : ""}</th>
                    <th scope="col">มูลค่ารวม</th>
                    <th scope="col">หน่วยงาน (ทั้งประเทศ)</th>
                    <th scope="col">ลงนามล่าสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={r.winner_id}>
                      <td className="text-center tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td>
                        <Link href={`/company/${r.winner_id}`}>{r.winner_name || r.winner_id}</Link>{" "}
                        <Link href={`/procurement/contracts?winner=${r.winner_id}`} className="text-xs">
                          (ดูสัญญา)
                        </Link>
                      </td>
                      <td className="text-right tabular-nums">{formatNumber(Number(r.contracts))}</td>
                      <td className="text-right whitespace-nowrap tabular-nums">{formatMillionBaht(Number(r.total_value))}</td>
                      <td className="text-right tabular-nums">{formatNumber(Number(r.agencies))}</td>
                      <td className="whitespace-nowrap">{r.last_sign ? formatThaiDate(r.last_sign) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <nav aria-label="หน้า" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                {page > 1 && <Link href={`/procurement/winners?${winnerQuery(f, { page: String(page - 1) })}`}>← ก่อนหน้า</Link>}
                <span className="text-wiki-muted">
                  หน้า {page} / {formatNumber(pages)}
                </span>
                {page < pages && page < 500 && (
                  <Link href={`/procurement/winners?${winnerQuery(f, { page: String(page + 1) })}`}>ถัดไป →</Link>
                )}
              </nav>
            )}
          </>
        )}
      </article>
    </main>
  );
}
