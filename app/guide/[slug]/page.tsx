import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import Ad from "@/components/Ad";
import AiArticleView from "@/components/AiArticleView";
import { getAiArticleBySlug, listAiArticles } from "@/lib/ai-articles";
import { formatThaiDate, SITE_NAME, SITE_URL } from "@/lib/format";
import { getGuide, GUIDES, type GuideMeta } from "@/lib/guides";

type Props = { params: Promise<{ slug: string }> };

// คู่มือที่เขียนเอง build ล่วงหน้า · บทความ AI ที่เผยแพร่แล้วดึงจากฐานข้อมูล (ISR)
export const dynamicParams = true;
export const revalidate = 3600;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

type Resolved = GuideMeta & { content: ReactNode; ai: false | "general" | "data" };

async function resolve(slug: string): Promise<Resolved | null> {
  const g = getGuide(slug);
  if (g) return { ...g, content: <g.Body />, ai: false as const };
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const a = await getAiArticleBySlug(slug).catch(() => null);
  if (!a) return null;
  const day = (a.publishedAt ?? a.createdAt).slice(0, 10);
  return {
    slug: a.slug,
    title: a.title,
    description: a.description,
    category: a.category,
    minutes: a.minutes,
    published: day,
    updated: day,
    content: <AiArticleView body={a.body} />,
    ai: a.kind,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = await resolve((await params).slug);
  if (!g) return { title: "ไม่พบบทความ" };
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/guide/${g.slug}` },
    openGraph: { type: "article", title: g.title, description: g.description, url: `/guide/${g.slug}`, siteName: SITE_NAME },
  };
}

export default async function GuidePage({ params }: Props) {
  const g = await resolve((await params).slug);
  if (!g) notFound();
  const ai = await listAiArticles("published", 50).catch(() => []);
  const all: Pick<GuideMeta, "slug" | "title" | "description" | "category" | "minutes">[] = [...GUIDES, ...ai];
  // หมวดเดียวกันก่อน แล้วตามด้วยหมวดอื่น (ไม่เกิน 8 เรื่อง)
  const others = [...all.filter((x) => x.slug !== g.slug && x.category === g.category), ...all.filter((x) => x.category !== g.category)].slice(0, 8);
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
            โดยทีมงาน {SITE_NAME} · {g.ai ? "เผยแพร่" : "ปรับปรุงล่าสุด"} {formatThaiDate(g.updated)} · อ่านประมาณ {g.minutes} นาที
          </p>
          <div className="guide-prose mt-4">{g.content}</div>
          <Ad page="guide" placement="content_bottom" />
          <p className="mt-6 border-t border-wiki-border-light pt-3 text-xs text-wiki-muted">
            {g.ai === "data" && "บทความนี้เรียบเรียงด้วยความช่วยเหลือของ AI จากสถิติในฐานข้อมูลของเรา ตัวเลขทุกตัวผ่านการตรวจกับข้อมูลต้นทางโดยอัตโนมัติ "}
            {g.ai === "general" && "บทความนี้เรียบเรียงด้วยความช่วยเหลือของ AI "}
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
              ดูคู่มือทั้งหมด →
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
