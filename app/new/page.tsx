import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CompanyTable from "@/components/CompanyTable";
import { newUrl } from "@/app/new/view";
import { getProvider } from "@/lib/api";
import { formatNumber, SITE_NAME } from "@/lib/format";
import { listMonthCompanies, listNewMonths } from "@/lib/new-repo";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "บริษัทเปิดใหม่ล่าสุด — รายชื่อบริษัทจดทะเบียนใหม่รายเดือน",
  description:
    "รายชื่อบริษัทและห้างหุ้นส่วนจดทะเบียนใหม่ในประเทศไทยรายเดือน แยกตามจังหวัดและประเภทธุรกิจ อัปเดตจากข้อมูลกรมพัฒนาธุรกิจการค้า",
  alternates: { canonical: "/new" },
};

export default async function NewIndexPage() {
  if (getProvider() !== "db") notFound();
  const months = await listNewMonths();
  const latest = months[0];
  const preview = latest ? (await listMonthCompanies(latest.ym, {})).slice(0, 20) : [];

  // จัดกลุ่มตามปี พ.ศ.
  const byYear = new Map<number, typeof months>();
  for (const m of months) byYear.set(m.yearBE, [...(byYear.get(m.yearBE) ?? []), m]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › บริษัทเปิดใหม่
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">บริษัทเปิดใหม่</h1>
        <p className="mt-3 leading-7">
          รายชื่อบริษัทและห้างหุ้นส่วนที่จดทะเบียนตั้งใหม่กับกรมพัฒนาธุรกิจการค้า แยกรายเดือนตั้งแต่มกราคม 2565
          เลือกเดือนเพื่อดูรายชื่อทั้งหมด กรองตามจังหวัดและประเภทธุรกิจได้ ฟรีบน {SITE_NAME}
        </p>

        {latest && (
          <section aria-labelledby="latest-h">
            <h2 id="latest-h" className="wiki-h2">
              ล่าสุด: {latest.label} <span className="text-base text-wiki-muted">({formatNumber(latest.count)} ราย)</span>
            </h2>
            <CompanyTable companies={preview} showTsic />
            <p className="mt-2 text-sm">
              <Link href={newUrl(latest.ym)}>ดูรายชื่อทั้งหมด {formatNumber(latest.count)} ราย →</Link>
            </p>
          </section>
        )}

        <h2 className="wiki-h2">ทุกเดือน</h2>
        {[...byYear].map(([year, list]) => (
          <section key={year} className="mb-4">
            <h3 className="mb-1 font-bold">พ.ศ. {year}</h3>
            <ul className="grid gap-x-6 gap-y-0.5 pl-5 text-sm sm:grid-cols-3">
              {list.map((m) => (
                <li key={m.ym} className="list-disc">
                  <Link href={newUrl(m.ym)}>{m.label}</Link> <span className="text-wiki-muted">({formatNumber(m.count)})</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </article>
    </main>
  );
}
