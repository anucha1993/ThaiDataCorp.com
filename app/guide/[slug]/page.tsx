import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Ad from "@/components/Ad";
import { formatThaiDate, SITE_NAME, SITE_URL } from "@/lib/format";
import { getGuide, GUIDES } from "@/lib/guides";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = getGuide((await params).slug);
  if (!g) return { title: "ไม่พบบทความ" };
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/guide/${g.slug}` },
    openGraph: { type: "article", title: g.title, description: g.description, url: `/guide/${g.slug}`, siteName: SITE_NAME },
  };
}

export default async function GuidePage({ params }: Props) {
  const g = getGuide((await params).slug);
  if (!g) notFound();
  const { Body } = g;
  // หมวดเดียวกันก่อน แล้วตามด้วยหมวดอื่น (ไม่เกิน 8 เรื่อง)
  const others = [...GUIDES.filter((x) => x.slug !== g.slug && x.category === g.category), ...GUIDES.filter((x) => x.category !== g.category)].slice(0, 8);
  const url = `${SITE_URL}/guide/${g.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: g.title,
        description: g.description,
        datePublished: g.published,
        dateModified: g.updated,
        inLanguage: "th-TH",
        mainEntityOfPage: url,
        author: { "@type": "Organization", name: `ทีมงาน ${SITE_NAME}`, url: SITE_URL },
        publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "หน้าหลัก", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "คู่มือ", item: `${SITE_URL}/guide` },
          { "@type": "ListItem", position: 3, name: g.title, item: url },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › <Link href="/guide">คู่มือ</Link>
      </nav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
          <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.6rem] leading-snug sm:text-[1.9rem]">{g.title}</h1>
          <p className="mt-2 text-xs text-wiki-muted">
            โดยทีมงาน {SITE_NAME} · ปรับปรุงล่าสุด {formatThaiDate(g.updated)} · อ่านประมาณ {g.minutes} นาที
          </p>
          <div className="guide-prose mt-4">
            <Body />
          </div>
          <Ad page="guide" placement="content_bottom" />
          <p className="mt-6 border-t border-wiki-border-light pt-3 text-xs text-wiki-muted">
            บทความนี้ให้ข้อมูลทั่วไปเพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางกฎหมายหรือภาษี ระเบียบและขั้นตอนของหน่วยงานรัฐอาจเปลี่ยนแปลง
            โปรดตรวจสอบกับหน่วยงานที่เกี่ยวข้อง · พบข้อผิดพลาด? <Link href="/contact">แจ้งเรา</Link>
          </p>
        </article>
        <aside className="lg:sticky lg:top-4">
          <div className="border border-wiki-border-light bg-white px-4 py-3">
            <h2 className="mb-2 font-bold">คู่มืออื่น</h2>
            <ul className="space-y-2 text-sm">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/guide/${o.slug}`}>{o.title}</Link>
                </li>
              ))}
            </ul>
            <Link href="/guide" className="mt-3 inline-block text-sm">
              ดูคู่มือทั้งหมด {GUIDES.length} เรื่อง →
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
