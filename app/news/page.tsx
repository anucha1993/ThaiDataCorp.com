import type { Metadata } from "next";
import Link from "next/link";
import { listNews } from "@/lib/business";
import { formatThaiDate, SITE_NAME } from "@/lib/format";
import { mediaUrl } from "@/lib/uploads";

type Props = { searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = Number((await searchParams).page) || 1;
  return {
    title: "ข่าวบริษัท — ข่าวสารจากบริษัทที่ยืนยันตัวตนแล้ว",
    description: `ข่าวสาร ประชาสัมพันธ์ และความเคลื่อนไหวจากบริษัทที่ยืนยันตัวตนกับ ${SITE_NAME}`,
    alternates: { canonical: "/news" },
    robots: page > 1 ? { index: false, follow: true } : { index: true, follow: true },
  };
}

const PAGE = 20;

export default async function NewsIndex({ searchParams }: Props) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { rows, total } = await listNews(page, PAGE);
  const pages = Math.ceil(total / PAGE);

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › ข่าวบริษัท
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">ข่าวบริษัท</h1>
        <p className="mt-3 text-sm text-wiki-muted">
          ข่าวสารที่บริษัทเผยแพร่เอง (ไม่ใช่เนื้อหาของ {SITE_NAME}) · บริษัทของคุณ? <Link href="/business">โพสต์ข่าวฟรี</Link>
        </p>
        {rows.length === 0 ? (
          <p className="mt-4 text-wiki-muted">ยังไม่มีข่าว</p>
        ) : (
          <ul className="mt-4 divide-y divide-wiki-border-light">
            {rows.map((n) => (
              <li key={n.id} className="flex gap-4 py-4">
                {n.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(n.image)!} alt="" className="hidden h-24 w-36 shrink-0 border border-wiki-border-light object-cover sm:block" />
                )}
                <div className="min-w-0">
                  <Link href={`/news/${n.id}`} className="text-lg">
                    {n.title}
                  </Link>
                  <div className="text-sm text-wiki-muted">
                    <Link href={`/company/${n.juristicId}`} className="text-wiki-text">
                      {n.companyName ?? n.juristicId}
                    </Link>{" "}
                    · {formatThaiDate(n.createdAt.slice(0, 10))}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm">{n.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav aria-label="หน้า" className="mt-3 flex gap-3 text-sm">
            {page > 1 && <Link href={`/news?page=${page - 1}`}>← ใหม่กว่า</Link>}
            <span className="text-wiki-muted">
              หน้า {page} / {pages}
            </span>
            {page < pages && <Link href={`/news?page=${page + 1}`}>เก่ากว่า →</Link>}
          </nav>
        )}
      </article>
    </main>
  );
}
