import type { Metadata } from "next";
import Link from "next/link";
import { ProvinceSelect } from "@/components/FilterForms";
import { buttonCls, inputCls } from "@/components/Panel";
import { EMPLOYMENT_TYPES, searchJobs } from "@/lib/business";
import { formatNumber, formatThaiDate, SITE_NAME } from "@/lib/format";
import { salaryText } from "@/lib/job-format";
import { listProvinces } from "@/lib/search-repo";
import { mediaUrl } from "@/lib/uploads";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = await searchParams;
  const filtered = Boolean(one(q.q) || one(q.province) || one(q.type) || one(q.page));
  return {
    title: `หางาน — ประกาศรับสมัครงานจากบริษัทที่ยืนยันตัวตนแล้ว${one(q.province) ? ` จังหวัด${one(q.province)}` : ""}`,
    description: `ประกาศรับสมัครงานจากบริษัทที่ยืนยันตัวตนกับ ${SITE_NAME} แล้ว ติดต่อบริษัทโดยตรง ไม่มีค่าใช้จ่าย`,
    alternates: { canonical: "/jobs" },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
  };
}

const PAGE = 30;

export default async function JobsPage({ searchParams }: Props) {
  const q = await searchParams;
  const f = { q: one(q.q), province: one(q.province), type: one(q.type) };
  const page = Math.max(1, Number(one(q.page)) || 1);
  const [{ rows, total }, provinces] = await Promise.all([searchJobs(f, page, PAGE), listProvinces()]);
  const pages = Math.ceil(total / PAGE);
  const link = (p: number) => `/jobs?${new URLSearchParams({ ...f, page: String(p) })}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › หางาน
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">หางาน</h1>
        <p className="mt-3 text-sm leading-6">
          ประกาศรับสมัครงานจาก<b>บริษัทที่ยืนยันตัวตนกับ {SITE_NAME} แล้ว</b> — ติดต่อบริษัทโดยตรงตามช่องทางในประกาศ ·{" "}
          <span className="text-red-800">การสมัครงานไม่มีค่าใช้จ่าย หากถูกเรียกเก็บเงินโปรดระวังและแจ้งเรา</span> · บริษัทของคุณ?{" "}
          <Link href="/business">ลงประกาศฟรี</Link>
        </p>

        <form method="get" className="my-4 grid gap-2 border border-wiki-border bg-wiki-bg p-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input name="q" defaultValue={f.q} placeholder="ตำแหน่ง / คำค้น / ชื่อบริษัท" className={inputCls} />
          <ProvinceSelect provinces={provinces} value={f.province} all="ทุกจังหวัด" />
          <select name="type" defaultValue={f.type} className={inputCls}>
            <option value="">ทุกประเภท</option>
            {Object.entries(EMPLOYMENT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonCls}>
            ค้นหา
          </button>
        </form>

        <p className="mb-2 text-sm text-wiki-muted">พบ {formatNumber(total)} ประกาศ</p>
        {rows.length === 0 ? (
          <p className="text-wiki-muted">ยังไม่มีประกาศที่ตรงเงื่อนไข</p>
        ) : (
          <ul className="divide-y divide-wiki-border-light">
            {rows.map((j) => (
              <li key={j.id} className="flex gap-3 py-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-wiki-border-light bg-white">
                  {j.companyLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(j.companyLogo)!} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-wiki-muted">งาน</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/jobs/${j.id}`} className="text-lg">
                    {j.title}
                  </Link>
                  <div className="text-sm">
                    <Link href={`/company/${j.juristicId}`} className="text-wiki-text">
                      {j.companyName ?? j.juristicId}
                    </Link>{" "}
                    <span className="text-xs text-green-800">✔</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-wiki-muted">
                    <span>{EMPLOYMENT_TYPES[j.employmentType]}</span>
                    <span>📍 {j.province}</span>
                    <span>💰 {salaryText(j.salaryMin, j.salaryMax, j.salaryNote)}</span>
                    <span>ประกาศ {formatThaiDate(j.createdAt.slice(0, 10))}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav aria-label="หน้า" className="mt-3 flex gap-3 text-sm">
            {page > 1 && <Link href={link(page - 1)}>← ก่อนหน้า</Link>}
            <span className="text-wiki-muted">
              หน้า {page} / {pages}
            </span>
            {page < pages && <Link href={link(page + 1)}>ถัดไป →</Link>}
          </nav>
        )}
      </article>
    </main>
  );
}
