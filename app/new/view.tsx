/**
 * บริษัทเปิดใหม่รายเดือน (pSEO) — ใช้ร่วมกันระหว่าง /new/[ym] และ /new/[ym]/[province]
 * ตัวกรองประเภทธุรกิจและหน้าที่ 2+ ใช้ query string → noindex (canonical ชี้หน้าหลักของเดือน)
 */
import Ad from "@/components/Ad";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CompanyTable from "@/components/CompanyTable";
import NewToolbox from "@/components/NewToolbox";
import { getProvider } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { memberToolNote } from "@/lib/billing";
import { primaryButtonCls } from "@/components/Panel";
import { formatNumber, inProvince, SITE_NAME, SITE_URL, tsicUrl } from "@/lib/format";
import {
  getMonthProvinces,
  getMonthStats,
  getMonthTopTsic,
  adjacentMonths,
  listMonthCompanies,
  listNewMonths,
  monthHasData,
  PAGE_SIZE,
  parseMonth,
} from "@/lib/new-repo";

export type NewSearchParams = Promise<{ tsic?: string | string[]; page?: string | string[] }>;

const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);

export function newUrl(ym: string, province?: string, query?: { tsic?: string; page?: number }) {
  const base = `/new/${ym}${province ? `/${encodeURIComponent(province)}` : ""}`;
  const qs = new URLSearchParams();
  if (query?.tsic) qs.set("tsic", query.tsic);
  if (query?.page && query.page > 1) qs.set("page", String(query.page));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

async function load(ym: string, province?: string, tsic?: string) {
  if (getProvider() !== "db") return null;
  const m = parseMonth(ym);
  if (!m) return null;
  if (tsic && !/^\d{5}$/.test(tsic)) return null;
  const stats = await getMonthStats(ym, province, tsic);
  if (!stats || stats.total === 0) return null;
  return stats;
}

function scope(province?: string) {
  return province ? inProvince(province) : "ทั่วประเทศ";
}

export async function newMetadata(ym: string, province: string | undefined, sp: NewSearchParams): Promise<Metadata> {
  const q = await sp;
  const tsic = first(q.tsic);
  const page = Number(first(q.page) ?? 1);
  const stats = await load(ym, province);
  if (!stats) return { title: "ไม่พบข้อมูล", robots: { index: false, follow: true } };
  const title = `บริษัทเปิดใหม่ ${stats.month.label}${province ? ` ${inProvince(province)}` : ""} — ${formatNumber(stats.total)} ราย`;
  const description = `รายชื่อบริษัทและห้างหุ้นส่วนจดทะเบียนใหม่${scope(province)} เดือน${stats.month.label} จำนวน ${formatNumber(stats.total)} ราย ทุนจดทะเบียนรวม ${formatNumber(stats.capital)} บาท พร้อมประเภทธุรกิจ ที่ตั้ง และวันจดทะเบียน`;
  const filtered = Boolean(tsic) || page > 1;
  return {
    title,
    description,
    alternates: { canonical: newUrl(ym, province) },
    robots: !filtered && stats.total >= 5 ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export async function NewView({ ym, province, searchParams }: { ym: string; province?: string; searchParams: NewSearchParams }) {
  const q = await searchParams;
  const tsic = first(q.tsic);
  const page = Math.max(1, Number(first(q.page) ?? 1) || 1);

  const stats = await load(ym, province);
  if (!stats) notFound();
  const filtered = tsic ? await getMonthStats(ym, province, tsic) : stats;
  if (!filtered) notFound();

  // หน้าแรกของแต่ละเดือนเปิดให้ทุกคน — หน้าถัดไปและตัวกรองประเภทธุรกิจสำหรับสมาชิก (หน้าเหล่านี้เป็น noindex อยู่แล้ว)
  const needsMember = page > 1 || Boolean(tsic);
  const locked = needsMember && !(await getCurrentUser());
  const [companies, topTsic, monthProvinces, allTsic, months] = await Promise.all([
    locked ? Promise.resolve([]) : listMonthCompanies(ym, { province, tsic, page }),
    getMonthTopTsic(ym, province),
    getMonthProvinces(ym),
    getMonthTopTsic(ym, province, 500),
    listNewMonths(),
  ]);
  const provinces = province ? [] : monthProvinces;
  const pages = Math.max(1, Math.ceil(filtered.total / PAGE_SIZE));
  if (page > pages) notFound();

  const m = stats.month;
  const adj = adjacentMonths(ym);
  const newer = adj.newer && (await monthHasData(adj.newer.ym)) ? adj.newer : null;
  const older = adj.older;
  const tsicName = tsic ? (topTsic.find((t) => t.code === tsic)?.name ?? tsic) : null;
  const pageUrl = `${SITE_URL}${newUrl(ym, province)}`;

  const top3 = topTsic.slice(0, 3).map((t) => `${t.name} (${formatNumber(t.count)} ราย)`);
  const intro =
    `ในเดือน${m.label} มีนิติบุคคลจดทะเบียนตั้งใหม่${scope(province)} ${formatNumber(stats.total)} ราย ` +
    `แบ่งเป็นบริษัทจำกัด ${formatNumber(stats.companies)} ราย และห้างหุ้นส่วน ${formatNumber(stats.partnerships)} ราย ` +
    `รวมทุนจดทะเบียน ${formatNumber(stats.capital)} บาท` +
    (top3.length ? ` ประเภทธุรกิจที่เปิดใหม่มากที่สุดคือ ${top3.join(", ")}` : "") +
    (stats.dissolved > 0 ? ` ปัจจุบันในจำนวนนี้จดทะเบียนเลิกกิจการแล้ว ${formatNumber(stats.dissolved)} ราย` : "");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": pageUrl,
        url: pageUrl,
        name: `บริษัทเปิดใหม่ ${m.label}${province ? ` ${inProvince(province)}` : ""}`,
        inLanguage: "th-TH",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: stats.total,
          itemListElement: companies.slice(0, 20).map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE_URL}/company/${c.id}`,
            name: c.nameTh,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "หน้าหลัก", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "บริษัทเปิดใหม่", item: `${SITE_URL}/new` },
          { "@type": "ListItem", position: 3, name: m.label, item: `${SITE_URL}${newUrl(ym)}` },
          ...(province ? [{ "@type": "ListItem", position: 4, name: province, item: pageUrl }] : []),
        ],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › <Link href="/new">บริษัทเปิดใหม่</Link> ›{" "}
        {province ? (
          <>
            <Link href={newUrl(ym)}>{m.label}</Link> › {province}
          </>
        ) : (
          m.label
        )}
      </nav>

      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] leading-tight sm:text-[2rem]">
          บริษัทเปิดใหม่ {m.label}
          {province && <span className="text-wiki-muted"> {inProvince(province)}</span>}
        </h1>
        <p className="mt-1 mb-3 flex flex-wrap gap-x-4 text-sm">
          {newer ? <Link href={newUrl(newer.ym, province)}>← {newer.label}</Link> : <span />}
          {older && <Link href={newUrl(older.ym, province)}>{older.label} →</Link>}
          <Link href="/new" className="ml-auto">
            ดูทุกเดือน
          </Link>
        </p>

        <p className="text-[0.95rem] leading-7">{intro}</p>

        <NewToolbox
          months={months}
          provinces={monthProvinces.map((p) => p.province).sort((x, y) => x.localeCompare(y, "th"))}
          tsics={allTsic}
          ym={ym}
          province={province}
          tsic={tsic}
          note={await memberToolNote("new")}
        />

        <h2 className="wiki-h2">
          รายชื่อบริษัทเปิดใหม่{tsicName ? ` ประเภท${tsicName}` : ""}
          <span className="text-base text-wiki-muted"> ({formatNumber(filtered.total)} ราย)</span>
        </h2>
        {locked ? (
          <div className="border border-wiki-border bg-wiki-bg px-4 py-5 text-center">
            <p className="mb-3">
              {tsic ? "การกรองตามประเภทธุรกิจ" : "การดูรายชื่อหน้าถัดไป"}สำหรับสมาชิก — สมัครฟรี ด้วยอีเมลหรือ Google
            </p>
            <Link href={`/register?next=${encodeURIComponent(newUrl(ym, province, { tsic, page }))}`} className={primaryButtonCls}>
              สมัครสมาชิกฟรี
            </Link>
            <p className="mt-3 text-sm">
              มีบัญชีแล้ว? <Link href={`/login?next=${encodeURIComponent(newUrl(ym, province, { tsic, page }))}`}>เข้าสู่ระบบ</Link>
            </p>
          </div>
        ) : (
          <CompanyTable companies={companies} showProvince={!province} showTsic={!tsic} />
        )}

        {pages > 1 && (
          <nav aria-label="หน้า" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {page > 1 && <Link href={newUrl(ym, province, { tsic, page: page - 1 })}>← ก่อนหน้า</Link>}
            <span className="text-wiki-muted">
              หน้า {page} / {pages}
            </span>
            {page < pages && <Link href={newUrl(ym, province, { tsic, page: page + 1 })}>ถัดไป →</Link>}
          </nav>
        )}

        {topTsic.length > 0 && (
          <>
            <h2 className="wiki-h2">ประเภทธุรกิจที่เปิดใหม่มากที่สุด</h2>
            <div className="overflow-x-auto">
              <table className="wikitable">
                <thead>
                  <tr>
                    <th scope="col">ประเภทธุรกิจ</th>
                    <th scope="col">จำนวน</th>
                    <th scope="col">ดูรายชื่อเดือนนี้</th>
                  </tr>
                </thead>
                <tbody>
                  {topTsic.map((t) => (
                    <tr key={t.code}>
                      <td>
                        <Link href={tsicUrl(t.code, province)}>{t.name}</Link>{" "}
                        <span className="font-mono text-xs text-wiki-muted">{t.code}</span>
                      </td>
                      <td className="text-right tabular-nums">{formatNumber(t.count)}</td>
                      <td>
                        <Link href={newUrl(ym, province, { tsic: t.code })}>รายชื่อ</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {provinces.length > 0 && (
          <>
            <h2 className="wiki-h2">แยกตามจังหวัด</h2>
            <ul className="grid gap-x-6 gap-y-0.5 pl-5 text-sm sm:grid-cols-3">
              {provinces.map((p) => (
                <li key={p.province} className="list-disc">
                  <Link href={newUrl(ym, p.province)}>{p.province}</Link>{" "}
                  <span className="text-wiki-muted">({formatNumber(p.count)})</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-6 text-xs text-wiki-muted">
          ที่มา: กรมพัฒนาธุรกิจการค้า — ชุดข้อมูลนิติบุคคลจดทะเบียนตั้งใหม่ (data.go.th, Open Data Common) ปรับปรุงทุกวันโดย{" "}
          {SITE_NAME}
        </p>
        <Ad page="list" placement="content_bottom" />
      </article>
    </main>
  );
}
