import Ad from "@/components/Ad";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import WinnerTable from "@/components/WinnerTable";
import { ContractFields, FilterBox } from "@/components/FilterForms";
import ViewsBox from "@/components/ViewsChart";
import { getEntityDaily } from "@/lib/analytics";
import { listContractProvinces } from "@/lib/procurement-search";
import WatchButton from "@/components/WatchButton";
import { memberToolNote } from "@/lib/billing";
import { decodeParam } from "@/app/tsic/tsic-view";
import { getProvider } from "@/lib/api";
import { formatMillionBaht, formatNumber, formatThaiDate, procurementUrl, SITE_NAME, SITE_URL, agencyUrl } from "@/lib/format";
import { getAgency, getAgencyLatest, getAgencyMethods, getAgencyTopWinners } from "@/lib/procurement-repo";

export const revalidate = 86400;
export async function generateStaticParams(): Promise<Array<{ name: string }>> {
  return [];
}

type Props = { params: Promise<{ name: string }> };

/** หน้าที่มีสัญญาน้อยกว่านี้ → noindex (เนื้อหาบาง) */
const MIN_INDEXABLE = 20;

async function load(raw: string) {
  if (getProvider() !== "db") return null;
  return getAgency(decodeParam(raw));
}

function intro(a: NonNullable<Awaited<ReturnType<typeof getAgency>>>) {
  const ebid = a.contracts > 0 ? ((a.ebidContracts / a.contracts) * 100).toFixed(1) : "0";
  return (
    `${a.agency} มีสัญญาจัดซื้อจัดจ้างกับนิติบุคคลในปีงบประมาณ 2568 ทั้งหมด ${formatNumber(a.contracts)} สัญญา ` +
    `มูลค่ารวม ${formatNumber(a.totalValue)} บาท กับผู้รับสัญญา ${formatNumber(a.winners)} ราย ` +
    `โดยร้อยละ ${ebid} ของสัญญาใช้วิธีประกวดราคา/e-bidding` +
    (a.topProvince ? ` และโครงการส่วนใหญ่อยู่ในจังหวัด${a.topProvince.replace(/^จังหวัด/, "")}` : "")
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await load((await params).name);
  if (!a) return { title: "ไม่พบหน่วยงาน", robots: { index: false, follow: true } };
  const title = `${a.agency} — สัญญาจัดซื้อจัดจ้าง ${formatNumber(a.contracts)} สัญญา มูลค่า ${formatMillionBaht(a.totalValue)}`;
  return {
    title,
    description: intro(a).slice(0, 158),
    alternates: { canonical: agencyUrl(a.agency) },
    robots: a.contracts >= MIN_INDEXABLE ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function AgencyPage({ params }: Props) {
  const a = await load((await params).name);
  if (!a) notFound();
  const [winners, methods, latest, contractProvinces, views] = await Promise.all([
    getAgencyTopWinners(a.agency, 50),
    getAgencyMethods(a.agency),
    getAgencyLatest(a.agency, 50),
    listContractProvinces(),
    getEntityDaily("agency", a.agency, 30).catch(() => null),
  ]);
  const top5Share = a.totalValue > 0 ? (winners.slice(0, 5).reduce((s, w) => s + w.value, 0) / a.totalValue) * 100 : 0;
  const pageUrl = `${SITE_URL}${agencyUrl(a.agency)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "GovernmentOrganization",
        "@id": `${pageUrl}#org`,
        name: a.agency,
        address: { "@type": "PostalAddress", addressCountry: "TH" },
      },
      {
        "@type": "WebPage",
        "@id": pageUrl,
        url: pageUrl,
        name: `${a.agency} — สัญญาจัดซื้อจัดจ้าง`,
        inLanguage: "th-TH",
        about: { "@id": `${pageUrl}#org` },
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "หน้าหลัก", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "หน่วยงานรัฐ", item: `${SITE_URL}/agency` },
          { "@type": "ListItem", position: 3, name: a.agency, item: pageUrl },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › <Link href="/agency">หน่วยงานรัฐ</Link> › <span aria-current="page">{a.agency}</span>
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] leading-tight sm:text-[2rem]">{a.agency}</h1>
        <div className="mt-1 mb-4 flex flex-wrap items-center gap-3 text-sm text-wiki-muted">
          <span>จาก {SITE_NAME} · ข้อมูลการจัดซื้อจัดจ้างภาครัฐ ปีงบประมาณ 2568</span>
          <div className="ml-auto flex items-center gap-3">
            <a href={`/export/contracts?agency=${encodeURIComponent(a.agency)}`} rel="nofollow">
              ⬇ CSV {await memberToolNote("contracts")}
            </a>
            <WatchButton kind="agency" target={a.agency} back={agencyUrl(a.agency)} label="ติดตามหน่วยงานนี้" />
          </div>
        </div>

        <FilterBox
          title="ค้นหา / กรอง / ดาวน์โหลดสัญญาของหน่วยงานนี้"
          action="/procurement/contracts"
          exportAction="/export/contracts"
          hidden={{ agency: a.agency }}
          open={false}
        >
          <ContractFields provinces={contractProvinces} fixedAgency />
        </FilterBox>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <aside className="lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1">
            <table className="w-full border-collapse border border-wiki-border bg-wiki-bg text-[0.85rem] leading-snug">
              <caption className="border border-b-0 border-wiki-border bg-wiki-header px-2 py-2 text-center font-bold">
                หน่วยงานรัฐ - {SITE_NAME}
              </caption>
              <tbody>
                {[
                  ["จำนวนสัญญา", `${formatNumber(a.contracts)} สัญญา`],
                  ["มูลค่ารวม", `${formatNumber(a.totalValue)} บาท`],
                  ["ผู้รับสัญญา", `${formatNumber(a.winners)} ราย`],
                  ["สัญญาแบบประกวดราคา", `${formatNumber(a.ebidContracts)} สัญญา`],
                  ["5 อันดับแรกได้มูลค่า", `${top5Share.toFixed(1)}%`],
                  ["จังหวัดหลัก", a.topProvince ?? "-"],
                ].map(([k, v]) => (
                  <tr key={k} className="border-t border-wiki-border-light">
                    <th scope="row" className="w-[45%] px-2 py-1.5 text-left align-top font-bold">
                      {k}
                    </th>
                    <td className="px-2 py-1.5 tabular-nums">
                      {k === "จังหวัดหลัก" && a.topProvince ? <Link href={procurementUrl(a.topProvince)}>{v}</Link> : v}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {views && <ViewsBox title="สถิติการเข้าชม 30 วันล่าสุด" data={views} />}
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <p className="text-[0.95rem] leading-7">{intro(a)}</p>

            <h2 className="wiki-h2">ผู้รับสัญญาที่มีมูลค่าสูงสุด</h2>
            <WinnerTable winners={winners} caption={`${winners.length} อันดับแรก (ตามมูลค่าสัญญา)`} />

            <h2 className="wiki-h2">วิธีการจัดซื้อจัดจ้าง</h2>
            <div className="overflow-x-auto">
              <table className="wikitable">
                <thead>
                  <tr>
                    <th scope="col">วิธี</th>
                    <th scope="col">จำนวนสัญญา</th>
                    <th scope="col">มูลค่า (บาท)</th>
                    <th scope="col">สัดส่วนมูลค่า</th>
                  </tr>
                </thead>
                <tbody>
                  {methods.map((m) => (
                    <tr key={m.method}>
                      <td>{m.method}</td>
                      <td className="text-right tabular-nums">{formatNumber(m.contracts)}</td>
                      <td className="text-right tabular-nums">{formatNumber(m.value)}</td>
                      <td className="text-right tabular-nums">
                        {a.totalValue > 0 ? `${((m.value / a.totalValue) * 100).toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="wiki-h2">สัญญาล่าสุด</h2>
            <div className="overflow-x-auto">
              <table className="wikitable">
                <thead>
                  <tr>
                    <th scope="col">วันที่ลงนาม</th>
                    <th scope="col">โครงการ</th>
                    <th scope="col">ผู้รับสัญญา</th>
                    <th scope="col">วิธี</th>
                    <th scope="col">มูลค่า (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((c, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap">{formatThaiDate(c.sign_date)}</td>
                      <td className="min-w-[16rem]">{c.project_name}</td>
                      <td className="min-w-[10rem]">
                        <Link href={`/company/${c.winner_id}`}>{c.winner_name ?? c.winner_id}</Link>
                      </td>
                      <td className="whitespace-nowrap">{c.method ?? "-"}</td>
                      <td className="text-right whitespace-nowrap tabular-nums">{formatNumber(Number(c.value))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="wiki-h2">แหล่งอ้างอิง</h2>
            <ol className="list-decimal pl-6 text-sm">
              <li>
                สำนักงานพัฒนารัฐบาลดิจิทัล.{" "}
                <a href="https://data.go.th/dataset/egp-contact-2568" rel="noopener nofollow" target="_blank">
                  ข้อมูลโครงการจัดซื้อจัดจ้างจากระบบการจัดซื้อจัดจ้างภาครัฐ ปีงบประมาณ 2568
                </a>{" "}
                (CC-BY)
              </li>
            </ol>
            <p className="mt-2 text-xs text-wiki-muted">
              นับเฉพาะสัญญาที่ผู้รับสัญญาเป็นนิติบุคคลและระบุเลขทะเบียนนิติบุคคล ไม่รวมสัญญากับบุคคลธรรมดา
            </p>
          </div>
        </div>
        <Ad page="list" placement="content_bottom" />
      </article>
    </main>
  );
}
