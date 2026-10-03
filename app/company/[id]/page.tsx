import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import WikipediaInfobox from "@/components/WikipediaInfobox";
import ProcurementSection from "@/components/ProcurementSection";
import SignalsSection from "@/components/SignalsSection";
import SameAddressSection from "@/components/SameAddressSection";
import ExternalLookup from "@/components/ExternalLookup";
import CompanyContact from "@/components/CompanyContact";
import ViewsBox from "@/components/ViewsChart";
import { getEntityDaily } from "@/lib/analytics";
import { getJuristicContact } from "@/lib/support";
import WatchButton from "@/components/WatchButton";
import { memberToolNote } from "@/lib/billing";
import StatusBadge from "@/components/StatusBadge";
import { getCompany, getProvider, isValidJuristicId, normalizeJuristicIdInput } from "@/lib/api";
import { OPEND_DATASET_URLS } from "@/lib/opend";
import {
  buildIntroText,
  dbdWarehouseUrl,
  displayName,
  formatBaht,
  formatJuristicId,
  formatNumber,
  formatThaiDate,
  SITE_NAME,
  SITE_URL,
  toBuddhistYear,
} from "@/lib/format";
import type { CompanyData, FinancialYear } from "@/types/company";

/* -------------------------------------------------------------------------- */
/*                         Rendering strategy (pSEO / ISR)                    */
/* -------------------------------------------------------------------------- */

// HTML ถูก render บน Server ครั้งแรกที่มีคนเข้า แล้ว cache เป็น static ไว้ 24 ชม. (ISR)
// → Googlebot และผู้ใช้ได้ HTML สำเร็จรูปทันที ไม่ต้องรอ API ภาครัฐทุกครั้ง
export const revalidate = 86400;

// ไม่ pre-build ตอน deploy (นิติบุคคลมีหลักล้านราย) — สร้างเมื่อมีคนเข้าครั้งแรก
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return [];
}

type PageProps = { params: Promise<{ id: string }> };

/* -------------------------------------------------------------------------- */
/*                                  Metadata                                  */
/* -------------------------------------------------------------------------- */

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = isValidJuristicId(id) ? await getCompany(id) : null;
  if (!data) {
    return { title: "ไม่พบข้อมูลนิติบุคคล", robots: { index: false, follow: true } };
  }

  const { profile } = data;
  const canonical = `/company/${profile.id}`;
  const title = `${displayName(profile.nameTh, profile.nameEn)} เลขทะเบียน ${profile.id}`;
  const description = truncate(buildIntroText(data), 160);
  const isMock = data.source === "mock";

  return {
    title,
    description,
    alternates: { canonical },
    // หน้า mock ห้าม index เด็ดขาด กันข้อมูลตัวอย่างหลุดไปอยู่บน Google
    robots: isMock ? { index: false, follow: false } : { index: true, follow: true, "max-snippet": -1 },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: "th_TH",
    },
    twitter: { card: "summary", title, description },
    other: {
      // ช่วยให้ระบบอื่นอ่านข้อมูลหลักได้โดยไม่ต้อง parse HTML
      "thaidatacorp:juristic-id": profile.id,
      "thaidatacorp:status": profile.statusText,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                    Page                                    */
/* -------------------------------------------------------------------------- */

export default async function CompanyPage({ params }: PageProps) {
  const { id: rawId } = await params;

  // URL ที่มีขีด เช่น /company/0-1055-53000-12-1 → redirect 308 ไป canonical (ไม่เกิด duplicate content)
  const id = normalizeJuristicIdInput(decodeURIComponent(rawId));
  if (id !== rawId && isValidJuristicId(id)) permanentRedirect(`/company/${id}`);
  if (!isValidJuristicId(id)) notFound();

  const data = await getCompany(id);
  if (!data) notFound();
  const [contact, views] =
    getProvider() === "db"
      ? await Promise.all([getJuristicContact(id).catch(() => null), getEntityDaily("company", id, 30).catch(() => null)])
      : [null, null];

  const { profile, directors, shareholders, financials, authorizedSignatory } = data;
  const hasPeople = directors.length > 0 || shareholders.length > 0;
  const hasFinancials = financials.length > 0;

  const toc = [
    { id: "overview", label: "ภาพรวม" },
    { id: "directors", label: "รายชื่อกรรมการและผู้ถือหุ้น" },
    ...(data.procurement ? [{ id: "procurement", label: "งานจัดซื้อจัดจ้างภาครัฐ" }] : []),
    ...(data.signals?.length ? [{ id: "signals", label: "ข้อสังเกตจากข้อมูลสาธารณะ" }] : []),
    ...(data.sameAddress?.total ? [{ id: "same-address", label: "นิติบุคคลที่อยู่เดียวกัน" }] : []),
    { id: "financials", label: "สรุปงบการเงินย่อ" },
    { id: "references", label: "แหล่งอ้างอิง" },
  ];

  return (
    <>
      <JsonLd data={data} />

      <main className="mx-auto max-w-6xl px-4 py-4">
        {data.source === "mock" && (
          <div role="note" className="mb-4 border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>ข้อมูลตัวอย่าง (Mock Data):</strong> ยังไม่ได้ตั้งค่า <code>GDX_CONSUMER_KEY</code> หรือ <code>OPEND_API_KEY</code> ใน <code>.env.local</code>{" "}
            ข้อมูลในหน้านี้เป็นข้อมูลสมมติเพื่อการพัฒนาเท่านั้น และหน้านี้ถูกตั้งค่า noindex
          </div>
        )}

        <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/">หน้าหลัก</Link>
            </li>
            <li aria-hidden="true">›</li>
            <li>นิติบุคคล</li>
            <li aria-hidden="true">›</li>
            <li aria-current="page" className="truncate">
              {profile.nameTh}
            </li>
          </ol>
        </nav>

        <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
          <header className="border-b border-wiki-border pb-2">
            <h1 className="font-serif text-[1.75rem] leading-tight sm:text-[2rem]">
              {profile.nameTh}
              {profile.nameEn && <span className="text-wiki-muted"> ({profile.nameEn})</span>}
            </h1>
          </header>
          <div className="mt-1 mb-4 flex flex-wrap items-center gap-x-2 text-sm text-wiki-muted">
            <span>
              จาก {SITE_NAME} · เลขทะเบียนนิติบุคคล{" "}
              <span className="font-mono text-wiki-text tabular-nums">{profile.id}</span>
            </span>
            <span aria-hidden="true">|</span>
            <span className="flex items-center gap-1">
              สถานะ: <StatusBadge status={profile.status} text={profile.statusText} />
            </span>
            {getProvider() === "db" && (
              <div className="ml-auto">
                <WatchButton kind="company" target={profile.id} back={`/company/${profile.id}`} label="ติดตามบริษัทนี้" />
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
            {/* Infobox: มือถือแสดงก่อนเนื้อหา, จอใหญ่อยู่ขวา (sticky) */}
            <div className="lg:col-start-2 lg:row-start-1">
              <WikipediaInfobox profile={profile} linkTsic={getProvider() === "db"} procurement={data.procurement} />
              {views && <ViewsBox title="สถิติการเข้าชม 30 วันล่าสุด" data={views} />}
            </div>

            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              {/* Section 1: Intro (Auto-generated) */}
              <section id="overview" aria-label="ภาพรวม">
                <p className="text-[0.95rem] leading-7">
                  <IntroText data={data} />
                </p>
                {profile.objective && (
                  <p className="mt-3 text-sm leading-6">
                    <b>วัตถุประสงค์ตามที่จดทะเบียน:</b> {profile.objective}
                  </p>
                )}
                <CompanyContact id={profile.id} contact={contact} />
                <ExternalLookup profile={profile} />
              </section>

              <TableOfContents items={toc} />

              {/* Section 2: Directors & Shareholders */}
              <section id="directors" aria-labelledby="directors-h">
                <h2 id="directors-h" className="wiki-h2">
                  รายชื่อกรรมการและผู้ถือหุ้น
                </h2>
                {!hasPeople && <EmptyNote>ยังไม่มีข้อมูลกรรมการและผู้ถือหุ้นของนิติบุคคลนี้ใน {SITE_NAME}</EmptyNote>}

                {directors.length > 0 && (
                  <div className="mb-5 overflow-x-auto">
                    <table className="wikitable">
                      <caption>รายชื่อกรรมการ ({directors.length} คน)</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="w-12">
                            ลำดับ
                          </th>
                          <th scope="col">ชื่อ–นามสกุล</th>
                          <th scope="col">ตำแหน่ง</th>
                        </tr>
                      </thead>
                      <tbody>
                        {directors.map((d) => (
                          <tr key={`${d.order}-${d.name}`}>
                            <td className="text-center tabular-nums">{d.order}</td>
                            <td>{d.name}</td>
                            <td>{d.position ?? "กรรมการ"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {authorizedSignatory && (
                  <p className="mb-5 text-sm">
                    <strong>อำนาจกรรมการ:</strong> {authorizedSignatory}
                  </p>
                )}

                {shareholders.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="wikitable">
                      <caption>ผู้ถือหุ้น</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="w-12">
                            ลำดับ
                          </th>
                          <th scope="col">ชื่อ</th>
                          <th scope="col">สัญชาติ</th>
                          <th scope="col">จำนวนหุ้น</th>
                          <th scope="col">สัดส่วน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shareholders.map((s, i) => (
                          <tr key={`${s.order}-${s.name}`}>
                            <td className="text-center tabular-nums">{i + 1}</td>
                            <td>{s.name}</td>
                            <td className="text-center">{s.nationality ?? "-"}</td>
                            <td className="text-right tabular-nums">{formatNumber(s.shares)}</td>
                            <td className="text-right tabular-nums">{s.percent.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {shareholders.length === 0 && (
                  <DbdLink id={profile.id}>{hasPeople ? "ดูรายชื่อผู้ถือหุ้น" : "ดูรายชื่อกรรมการและผู้ถือหุ้น"}</DbdLink>
                )}
              </section>

              {data.procurement && (
                <ProcurementSection
                  data={data.procurement}
                  exportHref={`/export/contracts?company=${profile.id}`}
                  exportNote={await memberToolNote("contracts")}
                />
              )}
              {data.signals && data.signals.length > 0 && <SignalsSection signals={data.signals} />}
              {data.sameAddress && data.sameAddress.total > 0 && <SameAddressSection data={data.sameAddress} />}

              {/* Section 3: Financial summary */}
              <section id="financials" aria-labelledby="financials-h">
                <h2 id="financials-h" className="wiki-h2">
                  สรุปงบการเงินย่อ
                </h2>
                {hasFinancials ? (
                  <FinancialTable financials={financials} />
                ) : (
                  <EmptyNote>ยังไม่มีข้อมูลงบการเงินของนิติบุคคลนี้ใน {SITE_NAME}</EmptyNote>
                )}
                {!hasFinancials && <DbdLink id={profile.id}>ดูงบการเงินที่นำส่งต่อกรมพัฒนาธุรกิจการค้า</DbdLink>}
              </section>

              <section id="references" aria-labelledby="references-h">
                <h2 id="references-h" className="wiki-h2">
                  แหล่งอ้างอิง
                </h2>
                <ol className="list-decimal space-y-1 pl-6 text-sm">
                  {data.procurement && (
                    <li>
                      สำนักงานพัฒนารัฐบาลดิจิทัล.{" "}
                      <a href="https://data.go.th/dataset/egp-contact-2568" rel="noopener nofollow" target="_blank">
                        ข้อมูลโครงการจัดซื้อจัดจ้างจากระบบการจัดซื้อจัดจ้างภาครัฐ
                      </a>
                      . data.go.th สัญญาอนุญาต Creative Commons Attribution
                    </li>
                  )}
                  {data.source === "opend" && (
                    <>
                      <li>
                        กรมพัฒนาธุรกิจการค้า.{" "}
                        <a href={OPEND_DATASET_URLS.newRegistration} rel="noopener nofollow" target="_blank">
                          นิติบุคคลจดทะเบียนตั้งใหม่
                        </a>{" "}
                        และ{" "}
                        <a href={OPEND_DATASET_URLS.dissolved} rel="noopener nofollow" target="_blank">
                          นิติบุคคลจดทะเบียนเลิกกิจการ
                        </a>
                        . ศูนย์กลางข้อมูลเปิดภาครัฐ (data.go.th) สัญญาอนุญาต Open Data Common
                      </li>
                    </>
                  )}
                  <li>
                    กรมพัฒนาธุรกิจการค้า กระทรวงพาณิชย์. ข้อมูลนิติบุคคลเลขทะเบียน {formatJuristicId(profile.id)}.{" "}
                    <a href={dbdWarehouseUrl(profile.id)} rel="noopener nofollow" target="_blank">
                      DBD DataWarehouse+
                    </a>
                  </li>
                  <li>
                    ระบบแลกเปลี่ยนข้อมูลภาครัฐ (GDX) สำนักงานพัฒนารัฐบาลดิจิทัล.{" "}
                    <a href="https://api.egov.go.th" rel="noopener nofollow" target="_blank">
                      api.egov.go.th
                    </a>
                  </li>
                </ol>
                {data.source === "opend" && (
                  <p className="mt-4 text-xs text-wiki-muted">
                    สถานะกิจการอ้างอิงจากชุดข้อมูลเปิดที่เริ่มตั้งแต่เดือนมกราคม 2565 การเปลี่ยนแปลงอื่นนอกเหนือจากการจดทะเบียนเลิก
                    (เช่น ร้าง หรือเสร็จการชำระบัญชี) อาจยังไม่สะท้อนในหน้านี้
                  </p>
                )}
                <p className="mt-4 text-xs text-wiki-muted">
                  ปรับปรุงข้อมูลล่าสุด:{" "}
                  <time dateTime={data.fetchedAt}>
                    {new Date(data.fetchedAt).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Bangkok" })}
                  </time>
                </p>
              </section>
            </div>
          </div>
        </article>
      </main>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Sub-components                             */
/* -------------------------------------------------------------------------- */

/** บทนำแบบ Wikipedia: ชื่อบริษัทตัวหนา ตามด้วยข้อความที่สร้างจากข้อมูล */
function IntroText({ data }: { data: CompanyData }) {
  const text = buildIntroText(data);
  const name = data.profile.nameTh;
  if (!text.startsWith(name)) return <>{text}</>;
  return (
    <>
      <b>{name}</b>
      {text.slice(name.length)}
    </>
  );
}

function TableOfContents({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <nav aria-labelledby="toc-h" className="my-5 inline-block border border-wiki-border bg-wiki-bg px-4 py-2 text-sm">
      <h2 id="toc-h" className="mb-1 text-center font-bold">
        สารบัญ
      </h2>
      <ol className="list-none space-y-0.5">
        {items.map((item, i) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>
              <span className="mr-2 text-wiki-text">{i + 1}</span>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function FinancialTable({ financials }: { financials: FinancialYear[] }) {
  // แสดงไม่เกิน 5 ปีล่าสุด เรียงจากเก่า → ใหม่ (ซ้าย → ขวา) แบบตารางงบการเงินทั่วไป
  const years = financials.slice(0, 5).reverse();
  const showLiabilities = years.some((y) => y.totalLiabilities != null);
  const showEquity = years.some((y) => y.equity != null);

  const rows: Array<{ label: string; get: (y: FinancialYear) => number | undefined; signed?: boolean }> = [
    { label: "รายได้รวม", get: (y) => y.totalRevenue },
    { label: "กำไร (ขาดทุน) สุทธิ", get: (y) => y.netProfit, signed: true },
    { label: "สินทรัพย์รวม", get: (y) => y.totalAssets },
    ...(showLiabilities ? [{ label: "หนี้สินรวม", get: (y: FinancialYear) => y.totalLiabilities }] : []),
    ...(showEquity ? [{ label: "ส่วนของผู้ถือหุ้น", get: (y: FinancialYear) => y.equity, signed: true }] : []),
  ];

  const latest = years[years.length - 1];
  const prev = years[years.length - 2];
  const growth = prev && prev.totalRevenue !== 0 ? ((latest.totalRevenue - prev.totalRevenue) / Math.abs(prev.totalRevenue)) * 100 : null;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="wikitable">
          <caption>งบการเงินย้อนหลัง (หน่วย: บาท)</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">
                รายการ
              </th>
              {years.map((y) => (
                <th key={y.fiscalYear} scope="col">
                  พ.ศ. {toBuddhistYear(y.fiscalYear)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="bg-wiki-bg! text-left! font-normal!">
                  {row.label}
                </th>
                {years.map((y) => {
                  const v = row.get(y);
                  const negative = row.signed && v != null && v < 0;
                  return (
                    <td key={y.fiscalYear} className={`text-right tabular-nums ${negative ? "text-red-700" : ""}`}>
                      {v == null ? "-" : negative ? `(${formatNumber(Math.abs(v))})` : formatNumber(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm">
        ในปีงบการเงิน พ.ศ. {toBuddhistYear(latest.fiscalYear)} บริษัทมีรายได้รวม {formatBaht(latest.totalRevenue)}
        {growth != null && <> ({growth >= 0 ? "เพิ่มขึ้น" : "ลดลง"} {Math.abs(growth).toFixed(1)}% จากปีก่อนหน้า)</>} และมี
        {latest.netProfit >= 0 ? `กำไรสุทธิ ${formatBaht(latest.netProfit)}` : `ขาดทุนสุทธิ ${formatBaht(Math.abs(latest.netProfit))}`}{" "}
        <span className="text-xs text-wiki-muted">(ตัวเลขในวงเล็บหมายถึงค่าติดลบ)</span>
      </p>
    </>
  );
}

/** ลิงก์ไปหน้าทางการบน DBD DataWarehouse+ สำหรับข้อมูลที่เรายังไม่มี */
function DbdLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="mt-2 text-sm">
      <a href={dbdWarehouseUrl(id)} rel="noopener nofollow" target="_blank">
        {children} ที่ DBD DataWarehouse+ ↗
      </a>
    </p>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-wiki-muted italic">{children}</p>;
}

/* -------------------------------------------------------------------------- */
/*                                   JSON-LD                                  */
/* -------------------------------------------------------------------------- */

function JsonLd({ data }: { data: CompanyData }) {
  const { profile: p, directors, financials } = data;
  const url = `${SITE_URL}/company/${p.id}`;
  const latest = financials[0];

  const organization = {
    "@type": "Organization",
    "@id": `${url}#organization`,
    name: p.nameTh,
    legalName: p.nameTh,
    ...(p.nameEn && { alternateName: p.nameEn }),
    url,
    identifier: {
      "@type": "PropertyValue",
      propertyID: "DBD Juristic Person Registration Number",
      value: p.id,
    },
    taxID: p.id, // เลขทะเบียนนิติบุคคลใช้เป็นเลขประจำตัวผู้เสียภาษีด้วย
    ...(p.registerDate && { foundingDate: p.registerDate }),
    ...(p.dissolvedDate && { dissolutionDate: p.dissolvedDate }),
    ...(p.tsic && { isicV4: p.tsic.code.slice(0, 4), knowsAbout: p.tsic.description }),
    address: {
      "@type": "PostalAddress",
      streetAddress: [p.address.houseNo, p.address.building, p.address.moo && `หมู่ ${p.address.moo}`, p.address.soi, p.address.street]
        .filter(Boolean)
        .join(" ") || undefined,
      addressLocality: p.address.district,
      addressRegion: p.address.province,
      postalCode: p.address.postCode,
      addressCountry: "TH",
    },
    ...(directors.length > 0 && {
      member: directors.map((d) => ({
        "@type": "OrganizationRole",
        roleName: d.position ?? "กรรมการ",
        member: { "@type": "Person", name: d.name },
      })),
    }),
    ...(latest && {
      // ตาม Schema.org ไม่มี revenue โดยตรง จึงใช้ additionalProperty
      additionalProperty: [
        { "@type": "PropertyValue", name: "registeredCapital", value: p.registerCapital, unitCode: "THB" },
        { "@type": "PropertyValue", name: `totalRevenue${latest.fiscalYear}`, value: latest.totalRevenue, unitCode: "THB" },
      ],
    }),
  };

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: `${displayName(p.nameTh, p.nameEn)} | ${SITE_NAME}`,
        inLanguage: "th-TH",
        about: { "@id": `${url}#organization` },
        dateModified: data.fetchedAt,
        isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: SITE_NAME, url: SITE_URL },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "หน้าหลัก", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: p.nameTh, item: url },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // escape "<" กัน XSS กรณีชื่อบริษัทมี "</script>"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }}
    />
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
