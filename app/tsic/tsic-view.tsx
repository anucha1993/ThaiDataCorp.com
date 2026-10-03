/**
 * หน้าประเภทธุรกิจ (pSEO) ใช้ร่วมกันระหว่าง /tsic/[code] และ /tsic/[code]/[province]
 * เนื้อหาสร้างจากข้อมูลจริงใน DB ทั้งหมด → แต่ละหน้ามีตัวเลข/รายชื่อเฉพาะตัว
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CompanyTable from "@/components/CompanyTable";
import { getProvider } from "@/lib/api";
import { formatNumber, inProvince, SITE_NAME, SITE_URL, toBuddhistYear, tsicUrl } from "@/lib/format";
import {
  getTsicPath,
  getTsicProvinces,
  getTsicSiblings,
  getTsicStats,
  listTsicCompanies,
  MIN_INDEXABLE_COMPANIES,
  type TsicNode,
  type TsicStats,
} from "@/lib/tsic-repo";

const LEVEL_LABEL: Record<number, string> = { 1: "หมวดใหญ่", 2: "หมวดย่อย", 3: "หมู่ใหญ่", 4: "หมู่ย่อย", 5: "กิจกรรม" };
const LIST_LIMIT = 100;

export function decodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** โหลดข้อมูลหลัก + ตรวจความถูกต้องของ URL (ใช้ทั้ง metadata และ page — React cache กันยิงซ้ำ) */
async function load(code: string, province?: string) {
  if (getProvider() !== "db" || !/^\d{5}$/.test(code)) return null;
  const path = await getTsicPath(code);
  if (!path) return null;
  const provinces = await getTsicProvinces(code);
  if (province && !provinces.some((p) => p.province === province)) return null;
  const stats = await getTsicStats(code, province);
  if (stats.total === 0) return null;
  return { path, node: path[path.length - 1], provinces, stats };
}

function scopeLabel(province?: string) {
  return province ? inProvince(province) : "ทั่วประเทศ";
}

function buildIntro(node: TsicNode, stats: TsicStats, provinces: Array<{ province: string; count: number }>, province?: string) {
  const parts = [
    `ธุรกิจประเภท${node.name.trim()} (รหัส TSIC ${node.code}) ${scopeLabel(province)} มีนิติบุคคลในฐานข้อมูล ${SITE_NAME} ทั้งหมด ${formatNumber(stats.total)} ราย`,
    `ยังดำเนินกิจการอยู่ ${formatNumber(stats.active)} ราย และจดทะเบียนเลิกแล้ว ${formatNumber(stats.dissolved)} ราย`,
    `รวมทุนจดทะเบียน ${formatNumber(stats.totalCapital)} บาท`,
  ];
  if (province) {
    const national = provinces.reduce((s, p) => s + p.count, 0);
    if (national > 0) parts.push(`คิดเป็นร้อยละ ${((stats.total / national) * 100).toFixed(1)} ของธุรกิจประเภทนี้ทั่วประเทศ`);
  } else if (provinces.length > 0) {
    const top = provinces.slice(0, 3).map((p) => `${p.province} (${formatNumber(p.count)} ราย)`);
    parts.push(`จังหวัดที่มีนิติบุคคลประเภทนี้มากที่สุดคือ ${top.join(", ")}`);
  }
  return parts.join(" ");
}

export async function tsicMetadata(code: string, province?: string): Promise<Metadata> {
  const data = await load(code, province);
  if (!data) return { title: "ไม่พบประเภทธุรกิจ", robots: { index: false, follow: true } };
  const { node, stats, provinces } = data;
  const title = `${node.name.trim()}${province ? ` ${inProvince(province)}` : ""} — รายชื่อนิติบุคคล ${formatNumber(stats.total)} ราย (TSIC ${code})`;
  const description = buildIntro(node, stats, provinces, province).slice(0, 158);
  const canonical = tsicUrl(code, province);
  return {
    title,
    description,
    alternates: { canonical },
    robots: stats.total >= MIN_INDEXABLE_COMPANIES ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", title, description, url: canonical, siteName: SITE_NAME, locale: "th_TH" },
  };
}

export async function TsicView({ code, province }: { code: string; province?: string }) {
  const data = await load(code, province);
  if (!data) notFound();
  const { path, node, provinces, stats } = data;
  const [companies, siblings] = await Promise.all([listTsicCompanies(code, province, LIST_LIMIT), getTsicSiblings(code)]);
  const name = node.name.trim();
  const pageUrl = `${SITE_URL}${tsicUrl(code, province)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": pageUrl,
        url: pageUrl,
        name: `${name}${province ? ` ${inProvince(province)}` : ""}`,
        inLanguage: "th-TH",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@type": "DefinedTerm", name, termCode: code, inDefinedTermSet: "TSIC 2552" },
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
          { "@type": "ListItem", position: 2, name: "ประเภทธุรกิจ", item: `${SITE_URL}/tsic` },
          { "@type": "ListItem", position: 3, name, item: `${SITE_URL}${tsicUrl(code)}` },
          ...(province ? [{ "@type": "ListItem", position: 4, name: province, item: pageUrl }] : []),
        ],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/">หน้าหลัก</Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <Link href="/tsic">ประเภทธุรกิจ</Link>
          </li>
          <li aria-hidden="true">›</li>
          {province ? (
            <>
              <li>
                <Link href={tsicUrl(code)}>{name}</Link>
              </li>
              <li aria-hidden="true">›</li>
              <li aria-current="page">{province}</li>
            </>
          ) : (
            <li aria-current="page" className="truncate">
              {name}
            </li>
          )}
        </ol>
      </nav>

      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <header className="border-b border-wiki-border pb-2">
          <h1 className="font-serif text-[1.75rem] leading-tight sm:text-[2rem]">
            {name}
            {province && <span className="text-wiki-muted"> {inProvince(province)}</span>}
          </h1>
        </header>
        <p className="mt-1 mb-4 text-sm text-wiki-muted">
          จาก {SITE_NAME} · รหัส TSIC <span className="font-mono text-wiki-text">{code}</span> · {formatNumber(stats.total)} นิติบุคคล
        </p>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <aside className="lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1">
            <table className="w-full border-collapse border border-wiki-border bg-wiki-bg text-[0.85rem] leading-snug">
              <caption className="border border-b-0 border-wiki-border bg-wiki-header px-2 py-2 text-center font-bold">
                ประเภทธุรกิจ - {SITE_NAME}
              </caption>
              <tbody>
                {path.map((n) => (
                  <tr key={n.code} className="border-t border-wiki-border-light">
                    <th scope="row" className="w-[38%] px-2 py-1.5 text-left align-top font-bold">
                      {LEVEL_LABEL[n.level]} <span className="font-mono font-normal">{n.code}</span>
                    </th>
                    <td className="px-2 py-1.5 align-top">{n.name.trim()}</td>
                  </tr>
                ))}
                <tr className="border-t border-wiki-border-light">
                  <th scope="row" className="px-2 py-1.5 text-left font-bold">นิติบุคคลทั้งหมด</th>
                  <td className="px-2 py-1.5 tabular-nums">{formatNumber(stats.total)} ราย</td>
                </tr>
                <tr className="border-t border-wiki-border-light">
                  <th scope="row" className="px-2 py-1.5 text-left font-bold">ยังดำเนินกิจการ</th>
                  <td className="px-2 py-1.5 tabular-nums">{formatNumber(stats.active)} ราย</td>
                </tr>
                <tr className="border-t border-wiki-border-light">
                  <th scope="row" className="px-2 py-1.5 text-left font-bold">ทุนจดทะเบียนรวม</th>
                  <td className="px-2 py-1.5 tabular-nums">{formatNumber(stats.totalCapital)} บาท</td>
                </tr>
                {stats.firstYear && stats.lastYear && (
                  <tr className="border-t border-wiki-border-light">
                    <th scope="row" className="px-2 py-1.5 text-left font-bold">ช่วงปีจดทะเบียน</th>
                    <td className="px-2 py-1.5 tabular-nums">
                      พ.ศ. {toBuddhistYear(stats.firstYear)}–{toBuddhistYear(stats.lastYear)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <section aria-label="ภาพรวม">
              <p className="text-[0.95rem] leading-7">{buildIntro(node, stats, provinces, province)}</p>
            </section>

            {!province && provinces.length > 0 && (
              <section aria-labelledby="provinces-h">
                <h2 id="provinces-h" className="wiki-h2">
                  จำนวนนิติบุคคลแยกตามจังหวัด
                </h2>
                <div className="overflow-x-auto">
                  <table className="wikitable">
                    <thead>
                      <tr>
                        <th scope="col">จังหวัด</th>
                        <th scope="col">จำนวนนิติบุคคล</th>
                        <th scope="col">สัดส่วน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {provinces.map((p) => (
                        <tr key={p.province}>
                          <td>
                            <Link href={tsicUrl(code, p.province)}>{p.province}</Link>
                          </td>
                          <td className="text-right tabular-nums">{formatNumber(p.count)}</td>
                          <td className="text-right tabular-nums">{((p.count / stats.total) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section aria-labelledby="companies-h">
              <h2 id="companies-h" className="wiki-h2">
                รายชื่อนิติบุคคล{province ? ` ${inProvince(province)}` : ""}
              </h2>
              {stats.total > LIST_LIMIT && (
                <p className="mb-2 text-sm text-wiki-muted">
                  แสดง {LIST_LIMIT} รายการ (ยังดำเนินกิจการก่อน เรียงตามวันจดทะเบียนล่าสุด) จากทั้งหมด {formatNumber(stats.total)} ราย
                  {!province && " — เลือกจังหวัดจากตารางด้านบนเพื่อดูรายชื่อเพิ่มเติม"}
                </p>
              )}
              <CompanyTable companies={companies} showProvince={!province} />
            </section>

            {province && (
              <p className="mt-4 text-sm">
                ดูธุรกิจ{name} <Link href={tsicUrl(code)}>ทั่วประเทศ ({formatNumber(provinces.reduce((s, p) => s + p.count, 0))} ราย)</Link>
              </p>
            )}

            {siblings.length > 0 && (
              <section aria-labelledby="related-h">
                <h2 id="related-h" className="wiki-h2">
                  ประเภทธุรกิจที่เกี่ยวข้อง
                </h2>
                <ul className="list-disc space-y-1 pl-6 text-sm">
                  {siblings.map((s) => (
                    <li key={s.node.code}>
                      <Link href={tsicUrl(s.node.code, province)}>{s.node.name.trim()}</Link>{" "}
                      <span className="text-wiki-muted">
                        ({s.node.code} · {formatNumber(s.count)} ราย ทั่วประเทศ)
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="ref-h">
              <h2 id="ref-h" className="wiki-h2">
                แหล่งอ้างอิง
              </h2>
              <ol className="list-decimal space-y-1 pl-6 text-sm">
                <li>
                  สำนักงานสถิติแห่งชาติ.{" "}
                  <a href="https://data.go.th/dataset/0210_12_0004" rel="noopener nofollow" target="_blank">
                    การจัดประเภทมาตรฐานอุตสาหกรรมประเทศไทย ปี 2552
                  </a>
                </li>
                <li>
                  กรมพัฒนาธุรกิจการค้า. ข้อมูลนิติบุคคลจดทะเบียนตั้งใหม่และเลิกกิจการ (data.go.th) และ DBD Open API
                </li>
              </ol>
              <p className="mt-3 text-xs text-wiki-muted">
                ตัวเลขนับจากฐานข้อมูล {SITE_NAME} ซึ่งครอบคลุมนิติบุคคลที่จดทะเบียนตั้งใหม่หรือเลิกกิจการตั้งแต่ปี 2565
                และนิติบุคคลที่มีการเปิดดูจาก DBD Open API จึงอาจน้อยกว่าจำนวนทั้งหมดที่จดทะเบียนกับกรมพัฒนาธุรกิจการค้า
              </p>
            </section>
          </div>
        </div>
      </article>
    </main>
  );
}
