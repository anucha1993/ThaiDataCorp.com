import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Paragraphs from "@/components/Paragraphs";
import { getNews, getProfile } from "@/lib/business";
import { formatThaiDate, SITE_NAME, SITE_URL } from "@/lib/format";
import { mediaUrl } from "@/lib/uploads";

export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

async function load(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const n = await getNews(id);
  if (!n || n.status !== "published") return null;
  if ((await getProfile(n.juristicId))?.hidden) return null;
  return n;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = await load((await params).id);
  if (!n) return { title: "ไม่พบข่าว", robots: { index: false, follow: false } };
  const image = mediaUrl(n.image);
  return {
    title: `${n.title} — ${n.companyName ?? ""}`,
    description: n.body.replace(/\s+/g, " ").slice(0, 158),
    alternates: { canonical: `/news/${n.id}` },
    openGraph: { type: "article", title: n.title, ...(image && { images: [`${SITE_URL}${image}`] }) },
  };
}

export default async function NewsPage({ params }: Props) {
  const n = await load((await params).id);
  if (!n) notFound();
  const image = mediaUrl(n.image);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: n.title,
    datePublished: n.createdAt.replace(" ", "T") + "+07:00",
    dateModified: n.updatedAt.replace(" ", "T") + "+07:00",
    ...(image && { image: [`${SITE_URL}${image}`] }),
    author: { "@type": "Organization", name: n.companyName ?? n.juristicId, url: `${SITE_URL}/company/${n.juristicId}` },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › <Link href="/news">ข่าวบริษัท</Link> › {n.title}
      </nav>
      <article className="max-w-4xl border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="font-serif text-[1.75rem] leading-tight sm:text-[2rem]">{n.title}</h1>
        <p className="mt-1 border-b border-wiki-border pb-2 text-sm text-wiki-muted">
          <Link href={`/company/${n.juristicId}`}>{n.companyName ?? n.juristicId}</Link>{" "}
          <span className="text-xs text-green-800">✔</span> · {formatThaiDate(n.createdAt.slice(0, 10))}
        </p>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="mt-4 max-h-[28rem] w-full border border-wiki-border-light object-contain" />
        )}
        <Paragraphs text={n.body} className="mt-4 text-[0.95rem] leading-7" />
        <p className="mt-6 border-t border-wiki-border-light pt-3 text-xs text-wiki-muted">
          เนื้อหานี้เผยแพร่โดย {n.companyName ?? "บริษัท"} ซึ่งยืนยันตัวตนกับ {SITE_NAME} แล้ว — ไม่ใช่ความเห็นของ {SITE_NAME} ·{" "}
          <Link href={`/contact?type=complaint&from=${encodeURIComponent(`/news/${n.id}`)}&subject=${encodeURIComponent(`รายงานข่าว #${n.id}`)}`}>
            รายงานเนื้อหานี้
          </Link>
        </p>
      </article>
    </main>
  );
}
