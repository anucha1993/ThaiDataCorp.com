import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProvider } from "@/lib/api";
import { formatNumber, SITE_NAME } from "@/lib/format";
import { listReportMonths } from "@/lib/report-repo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "ดัชนีธุรกิจไทยรายเดือน — สรุปบริษัทเปิดใหม่ เลิกกิจการ ธุรกิจมาแรง",
  description:
    "รายงานสรุปสถานการณ์ธุรกิจไทยรายเดือน สร้างอัตโนมัติจากข้อมูลภาครัฐ: บริษัทจดทะเบียนใหม่ เลิกกิจการ ธุรกิจและจังหวัดที่มาแรง งานภาครัฐ",
  alternates: { canonical: "/report" },
};

export default async function ReportIndexPage() {
  if (getProvider() !== "db") notFound();
  const months = await listReportMonths();
  const latest = months[0];
  const byYear = new Map<number, typeof months>();
  for (const m of months) byYear.set(m.yearBE, [...(byYear.get(m.yearBE) ?? []), m]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › ดัชนีธุรกิจไทย
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">ดัชนีธุรกิจไทยรายเดือน</h1>
        <p className="mt-3 leading-7">
          สรุปสถานการณ์ธุรกิจไทยทุกเดือน — จำนวนบริษัทเปิดใหม่และเลิกกิจการ ธุรกิจและจังหวัดที่มาแรง การจด VAT และงานภาครัฐ
          สร้างอัตโนมัติจากข้อมูลเปิดภาครัฐโดย {SITE_NAME} อัปเดตเมื่อสิ้นเดือน
        </p>
        {latest && (
          <p className="mt-4 border border-wiki-border-light bg-wiki-bg px-4 py-3">
            รายงานล่าสุด:{" "}
            <Link href={`/report/${latest.ym}`} className="font-bold">
              ดัชนีธุรกิจไทย {latest.label}
            </Link>{" "}
            <span className="text-sm text-wiki-muted">— จดทะเบียนใหม่ {formatNumber(latest.count)} ราย</span>
          </p>
        )}
        {[...byYear].map(([year, list]) => (
          <section key={year}>
            <h2 className="wiki-h2">พ.ศ. {year}</h2>
            <ul className="grid gap-x-6 gap-y-0.5 pl-5 text-sm sm:grid-cols-3">
              {list.map((m) => (
                <li key={m.ym} className="list-disc">
                  <Link href={`/report/${m.ym}`}>{m.label}</Link> <span className="text-wiki-muted">({formatNumber(m.count)} ราย)</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </article>
    </main>
  );
}
