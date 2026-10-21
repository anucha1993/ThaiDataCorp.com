import Link from "next/link";
import { notFound } from "next/navigation";
import AdminCard from "@/components/AdminCard";
import AiArticleView from "@/components/AiArticleView";
import { setArticleStatus } from "@/app/admin/articles/actions";
import { countRiskyText, getAiArticle } from "@/lib/ai-articles";

type Props = { params: Promise<{ id: string }> };

/** อ่านทวนบทความก่อนเผยแพร่ (หน้าตาเหมือนบนเว็บจริง) */
export default async function AiArticlePreview({ params }: Props) {
  const a = await getAiArticle(Number((await params).id));
  if (!a) notFound();
  const btn = (status: string, label: string, cls: string) => (
    <form action={setArticleStatus}>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={`border px-3 py-1 text-sm font-bold ${cls}`}>
        {label}
      </button>
    </form>
  );
  const risky = countRiskyText(a.body);
  return (
    <AdminCard
      title={a.status === "published" ? "บทความ (เผยแพร่แล้ว)" : a.status === "rejected" ? "บทความ (ไม่ใช้)" : "อ่านทวนก่อนเผยแพร่"}
      actions={<Link href="/admin/articles">← บทความทั้งหมด</Link>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {a.status !== "published" && btn("published", "✔ เผยแพร่", "border-green-700 text-green-800")}
        {a.status === "published" && btn("draft", "ยกเลิกเผยแพร่", "border-wiki-border")}
        {a.status !== "rejected" && btn("rejected", "ไม่ใช้บทความนี้", "border-red-700 text-red-800")}
        {a.status === "published" && (
          <Link href={`/guide/${a.slug}`} target="_blank">
            เปิดบนเว็บ ↗
          </Link>
        )}
        <span className="text-xs text-wiki-muted">
          หัวข้อ: {a.topic ?? "-"} · {a.model} · {a.tokens.toLocaleString()} tokens · /guide/{a.slug}
        </span>
      </div>
      {a.body.check && (
        <div className="mb-3 border border-green-600 bg-green-50 px-3 py-2 text-sm">
          บทความสถิติจากข้อมูลจริง: ตัวเลขในเนื้อหา <b>{a.body.check.verified}</b> ตัวตรงกับข้อมูลในฐานข้อมูล ตารางข้อมูลสำคัญดึงจากฐานข้อมูลโดยตรง
          {a.body.check.dropped.length > 0 && (
            <details className="mt-1">
              <summary>ระบบตัดทิ้ง {a.body.check.dropped.length} ย่อหน้าที่มีตัวเลขไม่ตรงข้อมูล</summary>
              <ul className="list-disc pl-5 text-xs">
                {a.body.check.dropped.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {!a.body.check && risky > 0 && (
        <p className="mb-3 border border-yellow-400 bg-yellow-50 px-3 py-2 text-sm">
          มี <b>{risky}</b> จุดที่มีตัวเลข/เปอร์เซ็นต์ (ไฮไลต์สีเหลือง) — AI มักแต่งอัตราภาษี ค่าปรับ กำหนดเวลาผิด ตรวจกับเว็บไซต์หน่วยงานก่อนเผยแพร่
        </p>
      )}
      <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.6rem] leading-snug">{a.title}</h1>
      <p className="mt-1 text-sm text-wiki-muted">
        {a.category} · {a.description}
      </p>
      <div className="guide-prose mt-4">
        <AiArticleView body={a.body} markRisky />
      </div>
    </AdminCard>
  );
}
