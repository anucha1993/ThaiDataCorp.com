import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listDataArticles } from "@/lib/ai-articles";
import { formatNumber, formatThaiDate } from "@/lib/format";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

function parse(q: Record<string, string | string[] | undefined>) {
  return {
    q: one(q.q).slice(0, 100),
    province: one(q.province).slice(0, 100),
    page: Math.max(1, Math.min(1000, Number(one(q.page)) || 1)),
  };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parse(await searchParams);
  const filtered = Boolean(f.q || f.province || f.page > 1);
  return {
    title: f.province && f.province !== "all" ? `สถิติธุรกิจจังหวัด${f.province}` : "สถิติธุรกิจรายประเภทและรายจังหวัด",
    description: "สถิตินิติบุคคลจดทะเบียนใหม่ตั้งแต่ปี 2565 แยกตามประเภทธุรกิจ (TSIC) และจังหวัด — จำนวนจดทะเบียน ทุนจดทะเบียน พื้นที่ การจด VAT และงานภาครัฐ",
    alternates: { canonical: "/guide/stats" },
    // หน้าที่กรอง/ค้นหา/หน้าถัดไป ไม่ต้องให้ Google เก็บซ้ำ (ยังตามลิงก์ไปบทความได้)
    ...(filtered && { robots: { index: false, follow: true } }),
  };
}

export default async function StatsIndexPage({ searchParams }: Props) {
  const f = parse(await searchParams);
  const data = await listDataArticles({ q: f.q || undefined, province: f.province || undefined, page: f.page }).catch(() => null);
  const pages = data ? Math.ceil(data.total / data.perPage) : 0;
  // หน้าเกินจำนวนที่มี → 404 (ไม่ให้เกิดหน้าว่างซ้ำๆ ให้ Google เก็บ)
  if (data && f.page > 1 && f.page > pages) notFound();
  const href = (p: Partial<typeof f>) => {
    const s = new URLSearchParams();
    const m = { ...f, ...p };
    if (m.q) s.set("q", m.q);
    if (m.province) s.set("province", m.province);
    if (m.page > 1) s.set("page", String(m.page));
    const qs = s.toString();
    return `/guide/stats${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › <Link href="/guide">บทความ</Link> › สถิติธุรกิจ
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">สถิติธุรกิจ</h1>
        <p className="mt-3 leading-7">
          สรุปนิติบุคคลที่จดทะเบียนใหม่ตั้งแต่ปี 2565 แยกตามประเภทธุรกิจ (TSIC) และจังหวัด — จำนวนจดทะเบียน แนวโน้ม ทุนจดทะเบียน พื้นที่ การจด VAT
          และงานภาครัฐ ตัวเลขดึงจากฐานข้อมูลโดยตรงและตรวจซ้ำอัตโนมัติ
        </p>

        <form method="get" action="/guide/stats" className="mt-4 flex flex-wrap gap-2 text-sm" role="search">
          <label className="sr-only" htmlFor="stats-q">
            ค้นหาประเภทธุรกิจ
          </label>
          <input
            id="stats-q"
            name="q"
            defaultValue={f.q}
            placeholder="ค้นหาธุรกิจ เช่น ร้านอาหาร ก่อสร้าง"
            className="min-w-0 flex-1 border border-wiki-border px-3 py-1.5"
          />
          <label className="sr-only" htmlFor="stats-province">
            จังหวัด
          </label>
          <select id="stats-province" name="province" defaultValue={f.province} className="border border-wiki-border px-2 py-1.5">
            <option value="">ทุกพื้นที่</option>
            <option value="all">เฉพาะภาพรวมทั่วประเทศ</option>
            {data?.provinces.map((p) => (
              <option key={p.province} value={p.province}>
                {p.province} ({formatNumber(p.n)})
              </option>
            ))}
          </select>
          <button type="submit" className="border border-wiki-border bg-wiki-bg px-4 py-1.5 font-bold">
            ค้นหา
          </button>
          {(f.q || f.province) && (
            <Link href="/guide/stats" className="self-center">
              ล้างตัวกรอง
            </Link>
          )}
        </form>

        {!data ? (
          <p className="mt-4 text-sm text-wiki-muted">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</p>
        ) : data.rows.length === 0 ? (
          <p className="mt-4 text-sm text-wiki-muted">
            {f.q || f.province ? "ไม่พบบทความที่ตรงกับตัวกรอง" : "กำลังจัดทำบทความสถิติ"} — ดูรายชื่อบริษัทตาม<Link href="/tsic">ประเภทธุรกิจ</Link>ได้
          </p>
        ) : (
          <>
            <p className="mt-4 mb-2 text-sm text-wiki-muted">
              พบ {formatNumber(data.total)} เรื่อง{pages > 1 && ` · หน้า ${data.page}/${pages}`}
            </p>
            <ul className="divide-y divide-wiki-border-light border border-wiki-border-light">
              {data.rows.map((a) => (
                <li key={a.slug} className="px-4 py-3">
                  <Link href={`/guide/${a.slug}`} className="font-bold">
                    {a.title}
                  </Link>
                  <p className="mt-1 text-sm text-wiki-muted">{a.description}</p>
                  <p className="mt-1 text-xs text-wiki-muted">
                    <Link href={href({ province: a.province ?? "all", page: 1 })}>{a.province ?? "ทั่วประเทศ"}</Link> · TSIC {a.tsic}
                    {a.publishedAt && ` · เผยแพร่ ${formatThaiDate(a.publishedAt.slice(0, 10))}`}
                  </p>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <nav aria-label="หน้า" className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                {data.page > 1 && <Link href={href({ page: data.page - 1 })}>← ก่อนหน้า</Link>}
                <span className="text-wiki-muted">
                  หน้า {data.page} จาก {pages}
                </span>
                {data.page < pages && <Link href={href({ page: data.page + 1 })}>ถัดไป →</Link>}
              </nav>
            )}
          </>
        )}
      </article>
    </main>
  );
}
