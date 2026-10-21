import type { Metadata } from "next";
import Link from "next/link";
import { formatNumber, formatThaiDate, SITE_NAME } from "@/lib/format";
import { listAiArticles, listDataArticles } from "@/lib/ai-articles";
import { GUIDE_CATEGORIES, GUIDES, type GuideMeta } from "@/lib/guides";

export const metadata: Metadata = {
  title: "บทความ คู่มือตรวจสอบบริษัท และสถิติธุรกิจ",
  description:
    "คู่มือการตรวจสอบคู่ค้า อ่านข้อมูลนิติบุคคล ภาษีมูลค่าเพิ่ม ทุนจดทะเบียน หนังสือรับรอง ประเภทธุรกิจ TSIC มอก. งานภาครัฐ และสถิติการจดทะเบียนธุรกิจรายประเภทและรายจังหวัด",
  alternates: { canonical: "/guide" },
};

// บทความ AI ที่เผยแพร่ใหม่จะขึ้นภายใน 1 ชม. (หรือทันทีเมื่อกดเผยแพร่)
export const revalidate = 3600;

/** สถิติที่แสดงในหน้ารวม — ที่เหลือดูที่ /guide/stats */
const LATEST_STATS = 12;

export default async function GuideIndexPage() {
  const [general, stats] = await Promise.all([
    // บทความ AI แบบความรู้ทั่วไปรวมกับคู่มือ · บทความสถิติแยกส่วนไม่ให้คู่มือจม
    listAiArticles("published", 500)
      .then((rows) => rows.filter((a) => a.kind !== "data"))
      .catch(() => []),
    listDataArticles({ perPage: LATEST_STATS }).catch(() => ({ rows: [], total: 0 })),
  ]);
  const guides: Pick<GuideMeta, "slug" | "title" | "description" | "category" | "minutes">[] = [...GUIDES, ...general];
  const categories = GUIDE_CATEGORIES.filter((c) => c !== "สถิติธุรกิจ");
  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › บทความ
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">บทความ</h1>
        <p className="mt-3 leading-7">
          บทความจากทีมงาน {SITE_NAME} — <a href="#guides">คู่มือ</a>อธิบายวิธีอ่านและใช้ข้อมูลนิติบุคคลจากหน่วยงานรัฐ ตั้งแต่การตรวจสอบคู่ค้าก่อนทำสัญญาไปจนถึงงานภาครัฐ
          และ<a href="#stats">สถิติธุรกิจ</a>สรุปการจดทะเบียนใหม่รายประเภทธุรกิจและรายจังหวัดจากข้อมูลจริง
        </p>

        <h2 id="guides" className="wiki-h2 text-[1.4rem]!">
          คู่มือ
        </h2>
        {categories.map((cat) => {
          const list = guides.filter((g) => g.category === cat);
          if (!list.length) return null;
          return (
            <section key={cat} aria-labelledby={`cat-${cat}`}>
              <h3 id={`cat-${cat}`} className="mt-5 mb-2 font-bold">
                {cat}
              </h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {list.map((g) => (
                  <li key={g.slug} className="border border-wiki-border-light px-4 py-3">
                    <Link href={`/guide/${g.slug}`} className="font-bold">
                      {g.title}
                    </Link>
                    <p className="mt-1 text-sm text-wiki-muted">{g.description}</p>
                    <p className="mt-1 text-xs text-wiki-muted">อ่านประมาณ {g.minutes} นาที</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <h2 id="stats" className="wiki-h2 text-[1.4rem]!">
          สถิติธุรกิจ
        </h2>
        {stats.rows.length ? (
          <>
            <p className="mb-3 text-sm text-wiki-muted">
              สถิตินิติบุคคลจดทะเบียนใหม่ตั้งแต่ปี 2565 แยกตามประเภทธุรกิจและจังหวัด ตัวเลขดึงจากฐานข้อมูลโดยตรงและตรวจซ้ำอัตโนมัติ
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {stats.rows.map((a) => (
                <li key={a.slug} className="border border-wiki-border-light px-4 py-3">
                  <Link href={`/guide/${a.slug}`} className="font-bold">
                    {a.title}
                  </Link>
                  <p className="mt-1 text-xs text-wiki-muted">
                    {a.province ?? "ทั่วประเทศ"}
                    {a.publishedAt && ` · เผยแพร่ ${formatThaiDate(a.publishedAt.slice(0, 10))}`}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3">
              <Link href="/guide/stats" className="font-bold">
                ดูสถิติธุรกิจทั้งหมด {formatNumber(stats.total)} เรื่อง — ค้นหาตามธุรกิจหรือจังหวัด →
              </Link>
            </p>
          </>
        ) : (
          <p className="text-sm text-wiki-muted">กำลังจัดทำ — ระหว่างนี้ดูรายชื่อบริษัทตาม<Link href="/tsic">ประเภทธุรกิจ</Link>ได้</p>
        )}
      </article>
    </main>
  );
}
