import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/format";
import { listAiArticles } from "@/lib/ai-articles";
import { GUIDE_CATEGORIES, GUIDES, type GuideMeta } from "@/lib/guides";

export const metadata: Metadata = {
  title: "คู่มือตรวจสอบบริษัทและข้อมูลธุรกิจ",
  description:
    "คู่มือการตรวจสอบคู่ค้า อ่านข้อมูลนิติบุคคล ภาษีมูลค่าเพิ่ม ทุนจดทะเบียน หนังสือรับรอง ประเภทธุรกิจ TSIC มอก. และข้อมูลจัดซื้อจัดจ้างภาครัฐ",
  alternates: { canonical: "/guide" },
};

// บทความ AI ที่เผยแพร่ใหม่จะขึ้นภายใน 1 ชม. (หรือทันทีเมื่อกดเผยแพร่)
export const revalidate = 3600;

export default async function GuideIndexPage() {
  const ai = await listAiArticles("published", 1000).catch(() => []);
  const all: Pick<GuideMeta, "slug" | "title" | "description" | "category" | "minutes">[] = [...GUIDES, ...ai];
  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › คู่มือ
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">คู่มือตรวจสอบบริษัทและข้อมูลธุรกิจ</h1>
        <p className="mt-3 leading-7">
          บทความจากทีมงาน {SITE_NAME} อธิบายวิธีอ่านและใช้ข้อมูลนิติบุคคลจากหน่วยงานรัฐให้เกิดประโยชน์ ตั้งแต่การตรวจสอบคู่ค้าก่อนทำสัญญา
          ไปจนถึงการหาซัพพลายเออร์และวิเคราะห์ตลาดงานภาครัฐ
        </p>
        {GUIDE_CATEGORIES.map((cat) => {
          const list = all.filter((g) => g.category === cat);
          if (!list.length) return null;
          return (
            <section key={cat} aria-labelledby={`cat-${cat}`}>
              <h2 id={`cat-${cat}`} className="wiki-h2">
                {cat}
              </h2>
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
      </article>
    </main>
  );
}
