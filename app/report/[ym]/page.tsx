import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MonthlyBars, RankBars, ShareBar } from "@/components/HomeCharts";
import { getProvider } from "@/lib/api";
import { CHANGE_LABELS, isChangeField } from "@/lib/changes-repo";
import { agencyUrl, formatBaht, formatMillionBaht, formatNumber, SITE_NAME, tsicUrl } from "@/lib/format";
import { getMonthlyReport, listReportMonths } from "@/lib/report-repo";

export const revalidate = 86400;

type Props = { params: Promise<{ ym: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ym } = await params;
  const r = getProvider() === "db" ? await getMonthlyReport(ym) : null;
  if (!r) return { title: "ไม่พบรายงาน", robots: { index: false } };
  const title = `ดัชนีธุรกิจไทย ${r.month.label} — บริษัทเปิดใหม่ ${formatNumber(r.newCount)} ราย`;
  const description = `สรุปสถานการณ์ธุรกิจไทยเดือน${r.month.label}: จดทะเบียนใหม่ ${formatNumber(r.newCount)} ราย ทุนรวม ${formatMillionBaht(r.capital)} เลิกกิจการ ${formatNumber(r.dissolved)} ราย ธุรกิจมาแรง จังหวัดที่เปิดบริษัทมากที่สุด และงานภาครัฐ`;
  return { title, description, alternates: { canonical: `/report/${ym}` }, openGraph: { title, description, url: `/report/${ym}`, siteName: SITE_NAME } };
}

const pctChange = (now: number, before: number | null) => (before && before > 0 ? ((now - before) / before) * 100 : null);

function Delta({ now, before, label }: { now: number; before: number | null; label: string }) {
  const p = pctChange(now, before);
  if (p == null) return null;
  return (
    <span className={`text-sm ${p >= 0 ? "text-green-700" : "text-red-700"}`}>
      {p >= 0 ? "▲" : "▼"} {Math.abs(p).toFixed(1)}% {label}
    </span>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="border border-wiki-border-light px-3 py-2">
      <div className="text-xs text-wiki-muted">{label}</div>
      <div className="font-serif text-2xl">{value}</div>
      {children}
    </div>
  );
}

export default async function ReportPage({ params }: Props) {
  if (getProvider() !== "db") notFound();
  const { ym } = await params;
  const r = await getMonthlyReport(ym);
  if (!r) notFound();
  const months = await listReportMonths();
  const idx = months.findIndex((m) => m.ym === ym);
  const newer = idx > 0 ? months[idx - 1] : null;
  const older = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;
  const top = r.topTsic[0];
  const topProv = r.provinces[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › <Link href="/report">ดัชนีธุรกิจไทย</Link> › {r.month.label}
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">ดัชนีธุรกิจไทย {r.month.label}</h1>

        {/* สรุปเป็นย่อหน้า — สร้างจากตัวเลขอัตโนมัติ */}
        <p className="mt-3 leading-7">
          เดือน{r.month.label} มีนิติบุคคลจดทะเบียนตั้งใหม่ <b>{formatNumber(r.newCount)} ราย</b> ทุนจดทะเบียนรวม {formatMillionBaht(r.capital)}
          {r.prevCount != null && r.prev && (
            <>
              {" "}
              {r.newCount >= r.prevCount ? "เพิ่มขึ้น" : "ลดลง"} {Math.abs(pctChange(r.newCount, r.prevCount) ?? 0).toFixed(1)}% จากเดือน{r.prev.label}
            </>
          )}
          {r.lastYearCount != null && (
            <>
              {" "}
              และ{r.newCount >= r.lastYearCount ? "เพิ่มขึ้น" : "ลดลง"} {Math.abs(pctChange(r.newCount, r.lastYearCount) ?? 0).toFixed(1)}% จากเดือนเดียวกันของปีก่อน
            </>
          )}
          {" "}
          มีนิติบุคคลจดทะเบียนเลิกกิจการ {formatNumber(r.dissolved)} ราย
          {top && (
            <>
              {" "}
              ประเภทธุรกิจที่เปิดใหม่มากที่สุดคือ <Link href={tsicUrl(top.code)}>{top.name}</Link> ({formatNumber(top.count)} ราย)
            </>
          )}
          {topProv && (
            <>
              {" "}
              และจังหวัดที่มีบริษัทเปิดใหม่มากที่สุดคือ{topProv.province} ({formatNumber(topProv.count)} ราย)
            </>
          )}
        </p>

        <section aria-label="ตัวเลขสำคัญ" className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat label="จดทะเบียนใหม่" value={`${formatNumber(r.newCount)} ราย`}>
            <Delta now={r.newCount} before={r.prevCount} label="จากเดือนก่อน" />
          </Stat>
          <Stat label="ทุนจดทะเบียนรวม" value={formatMillionBaht(r.capital)} />
          <Stat label="จดทะเบียนเลิกกิจการ" value={`${formatNumber(r.dissolved)} ราย`} />
          <Stat label="จด VAT ใหม่ (สำนักงานใหญ่)" value={`${formatNumber(r.vatNew)} ราย`} />
        </section>

        <section aria-labelledby="trend-h">
          <h2 id="trend-h" className="wiki-h2">
            แนวโน้มจดทะเบียนใหม่ 13 เดือน
          </h2>
          <MonthlyBars data={r.trend} />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="tsic-h">
            <h2 id="tsic-h" className="wiki-h2">
              ธุรกิจที่เปิดใหม่มากที่สุด
            </h2>
            <RankBars
              rows={r.topTsic.map((t) => ({ label: t.name, value: t.count, href: tsicUrl(t.code) }))}
              unit="ราย"
            />
          </section>
          <section aria-labelledby="prov-h">
            <h2 id="prov-h" className="wiki-h2">
              จังหวัดที่เปิดบริษัทใหม่มากที่สุด
            </h2>
            <RankBars
              rows={r.provinces.map((p) => ({ label: p.province, value: p.count, href: `/new/${r.month.ym}/${encodeURIComponent(p.province)}` }))}
              unit="ราย"
            />
          </section>
        </div>

        {r.risingTsic.length > 0 && (
          <section aria-labelledby="rising-h">
            <h2 id="rising-h" className="wiki-h2">
              ธุรกิจมาแรง (เติบโตเร็วที่สุดจากเดือนก่อน)
            </h2>
            <ul className="list-disc space-y-1 pl-6 text-sm">
              {r.risingTsic.map((t) => (
                <li key={t.code}>
                  <Link href={tsicUrl(t.code)}>{t.name}</Link> — {formatNumber(t.count)} ราย (เดือนก่อน {formatNumber(t.prev)} ราย,{" "}
                  <span className="text-green-700">▲ {(((t.count - t.prev) / t.prev) * 100).toFixed(0)}%</span>)
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.types.length > 0 && (
          <section aria-labelledby="types-h">
            <h2 id="types-h" className="wiki-h2">
              ประเภทนิติบุคคลที่จดทะเบียนใหม่
            </h2>
            <ShareBar parts={r.types.map((t) => ({ label: t.name, value: t.count }))} />
          </section>
        )}

        {r.gov.contracts > 0 && (
          <section aria-labelledby="gov-h">
            <h2 id="gov-h" className="wiki-h2">
              งานภาครัฐที่ลงนามในเดือนนี้
            </h2>
            <p className="mb-3 text-sm">
              {formatNumber(r.gov.contracts)} สัญญา มูลค่ารวม {formatBaht(r.gov.value)} (ข้อมูลจากระบบ e-GP)
            </p>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-1 font-bold">หน่วยงานที่ทำสัญญามูลค่าสูงสุด</h3>
                <RankBars rows={r.gov.agencies.map((a) => ({ label: a.agency, value: a.value, href: agencyUrl(a.agency) }))} format={formatMillionBaht} />
              </div>
              <div>
                <h3 className="mb-1 font-bold">นิติบุคคลที่ได้สัญญามูลค่าสูงสุด</h3>
                <RankBars rows={r.gov.winners.map((w) => ({ label: w.name, value: w.value, href: `/company/${w.id}` }))} format={formatMillionBaht} />
              </div>
            </div>
          </section>
        )}

        {r.changes.length > 0 && (
          <section aria-labelledby="changes-h">
            <h2 id="changes-h" className="wiki-h2">
              ความเคลื่อนไหวนิติบุคคลที่ตรวจพบ
            </h2>
            <ul className="list-disc space-y-0.5 pl-6 text-sm">
              {r.changes.map((c) => (
                <li key={c.field}>
                  <Link href={`/changes?type=${c.field}`}>{isChangeField(c.field) ? CHANGE_LABELS[c.field] : c.field}</Link>{" "}
                  {formatNumber(c.count)} ราย
                </li>
              ))}
              {r.capitalUp.count > 0 && (
                <li>
                  เพิ่มทุนรวม {formatNumber(r.capitalUp.count)} ราย มูลค่าทุนที่เพิ่มขึ้น {formatBaht(r.capitalUp.total)}
                </li>
              )}
            </ul>
          </section>
        )}

        <nav aria-label="เดือนอื่น" className="mt-6 flex justify-between text-sm">
          {older ? <Link href={`/report/${older.ym}`}>← {older.label}</Link> : <span />}
          {newer && <Link href={`/report/${newer.ym}`}>{newer.label} →</Link>}
        </nav>

        <p className="mt-6 text-xs text-wiki-muted">
          รายงานนี้สร้างอัตโนมัติจากข้อมูลเปิดภาครัฐ: นิติบุคคลจดทะเบียนตั้งใหม่/เลิกกิจการ (กรมพัฒนาธุรกิจการค้า), ทะเบียนภาษีมูลค่าเพิ่ม
          (กรมสรรพากร) และสัญญาจัดซื้อจัดจ้าง (e-GP) — ตัวเลขอาจเปลี่ยนเล็กน้อยเมื่อหน่วยงานปรับปรุงข้อมูลย้อนหลัง อ้างอิงได้โดยระบุที่มา &ldquo;
          {SITE_NAME}&rdquo; พร้อมลิงก์มายังหน้านี้
        </p>
      </article>
    </main>
  );
}
