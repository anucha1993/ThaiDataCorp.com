import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractFields, FilterBox, MemberLock } from "@/components/FilterForms";
import { getProvider } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { agencyUrl, formatNumber, formatThaiDate } from "@/lib/format";
import { contractQuery, hasContractFilter, listContractProvinces, parseContractFilters, searchContracts } from "@/lib/procurement-search";

export const metadata: Metadata = {
  title: "ค้นหาสัญญาจัดซื้อจัดจ้างภาครัฐ",
  robots: { index: false, follow: true },
  alternates: { canonical: "/procurement/contracts" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PAGE_SIZE = 50;

export default async function ContractSearchPage({ searchParams }: Props) {
  if (getProvider() !== "db") notFound();
  const sp = await searchParams;
  const f = parseContractFilters(sp);
  const page = Math.max(1, Math.min(200, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1));
  const [user, provinces] = await Promise.all([getCurrentUser(), listContractProvinces()]);
  const self = `/procurement/contracts?${contractQuery(f)}`;
  const result = user && hasContractFilter(f) ? await searchContracts(f, page, PAGE_SIZE) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › <Link href="/procurement">ผู้รับงานภาครัฐ</Link> › ค้นหาสัญญา
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem]">ค้นหาสัญญาจัดซื้อจัดจ้างภาครัฐ</h1>
        <p className="mt-3 text-sm leading-6 text-wiki-muted">
          สัญญาจัดซื้อจัดจ้างที่ผู้รับสัญญาเป็นนิติบุคคล ปีงบประมาณ 2568 จากระบบ e-GP (ราว 2 ล้านสัญญา) — เลือกตัวกรองอย่างน้อย 1 อย่าง
        </p>
        {f.agency && (
          <p className="mt-2 text-sm">
            หน่วยงาน: <Link href={agencyUrl(f.agency)}>{f.agency}</Link> ·{" "}
            <Link href={`/procurement/contracts?${contractQuery({ ...f, agency: undefined })}`}>ทุกหน่วยงาน</Link>
          </p>
        )}

        <FilterBox title="ตัวกรองสัญญา" action="/procurement/contracts" exportAction="/export/contracts" hidden={{ agency: f.agency }}>
          <ContractFields f={f} provinces={provinces} fixedAgency={Boolean(f.agency)} />
        </FilterBox>

        {!user ? (
          <MemberLock next={self} what="การค้นหาและดาวน์โหลดสัญญาภาครัฐ" />
        ) : !result ? (
          <p className="text-wiki-muted">เลือกตัวกรองแล้วกด &ldquo;ค้นหา / กรอง&rdquo;</p>
        ) : result.timedOut ? (
          <p className="text-red-800">
            ตัวกรองกว้างเกินไป{f.sort === "value" ? "สำหรับการเรียงตามมูลค่า" : ""} — เพิ่มตัวกรอง เช่น หน่วยงาน ผู้รับสัญญา หรือช่วงวันที่ลงนาม
            {f.sort === "value" && " หรือเปลี่ยนเป็นเรียงตามวันที่ลงนามล่าสุด"}
          </p>
        ) : result.rows.length === 0 ? (
          <p className="text-wiki-muted">ไม่พบสัญญาตามเงื่อนไข</p>
        ) : (
          <>
            <p className="mb-2 flex flex-wrap gap-x-4 text-sm">
              <span className="text-wiki-muted">
                แสดงรายการที่ {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber((page - 1) * PAGE_SIZE + result.rows.length)}
              </span>
              <a href={`/export/contracts?${contractQuery(f)}`} rel="nofollow" className="font-bold">
                ⬇ ดาวน์โหลดผลเป็น CSV
              </a>
            </p>
            <div className="overflow-x-auto">
              <table className="wikitable">
                <thead>
                  <tr>
                    <th scope="col">วันที่ลงนาม</th>
                    <th scope="col">โครงการ</th>
                    <th scope="col">หน่วยงาน</th>
                    <th scope="col">ผู้รับสัญญา</th>
                    <th scope="col">วิธี</th>
                    <th scope="col">จังหวัด</th>
                    <th scope="col">มูลค่า (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={`${r.fiscal_year}-${r.seq}`}>
                      <td className="whitespace-nowrap">{r.sign_date ? formatThaiDate(r.sign_date) : "-"}</td>
                      <td className="min-w-64">{r.project_name}</td>
                      <td>{r.agency ? <Link href={agencyUrl(r.agency)}>{r.agency}</Link> : "-"}</td>
                      <td>
                        <Link href={`/company/${r.winner_id}`}>{r.winner_name || r.winner_id}</Link>
                      </td>
                      <td className="text-xs">{r.method ?? "-"}</td>
                      <td>{r.province ?? "-"}</td>
                      <td className="text-right whitespace-nowrap tabular-nums">{formatNumber(Number(r.value))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="หน้า" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {page > 1 && <Link href={`/procurement/contracts?${contractQuery(f, { page: String(page - 1) })}`}>← ก่อนหน้า</Link>}
              <span className="text-wiki-muted">หน้า {page}</span>
              {result.hasNext && page < 200 && (
                <Link href={`/procurement/contracts?${contractQuery(f, { page: String(page + 1) })}`}>ถัดไป →</Link>
              )}
            </nav>
          </>
        )}
      </article>
    </main>
  );
}
