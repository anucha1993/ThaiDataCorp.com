import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProvider, isValidJuristicId, normalizeJuristicIdInput, searchCompaniesByName } from "@/lib/api";
import { formatJuristicId } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

// หน้าผลค้นหาไม่ควรถูก index (เนื้อหาบาง/ซ้ำ) แต่ให้ bot ตามลิงก์ไปหน้าบริษัทได้
export const metadata: Metadata = {
  title: "ค้นหานิติบุคคล",
  robots: { index: false, follow: true },
  alternates: { canonical: "/search" },
};

type SearchProps = { searchParams: Promise<{ q?: string | string[] }> };

export default async function SearchPage({ searchParams }: SearchProps) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";

  // พิมพ์เลขทะเบียน 13 หลัก → ไปหน้าบริษัททันที
  const asId = normalizeJuristicIdInput(query);
  if (isValidJuristicId(asId)) redirect(`/company/${asId}`);

  const results = query ? await searchCompaniesByName(query) : [];
  const looksLikeId = /^\d[\d\s-]*$/.test(query);

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem]">ผลการค้นหา</h1>

        <form action="/search" method="get" role="search" className="my-4 flex max-w-xl">
          <label htmlFor="q" className="sr-only">
            คำค้นหา
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="ชื่อบริษัท หรือเลขทะเบียน 13 หลัก"
            className="min-w-0 flex-1 rounded-l-sm border border-wiki-border px-3 py-1.5 outline-none focus:border-wiki-link"
          />
          <button type="submit" className="rounded-r-sm border border-l-0 border-wiki-border bg-wiki-bg px-4 font-bold hover:bg-wiki-header">
            ค้นหา
          </button>
        </form>

        {!query && <p className="text-wiki-muted">พิมพ์ชื่อบริษัท หรือเลขทะเบียนนิติบุคคล 13 หลัก เพื่อเริ่มค้นหา</p>}

        {query && looksLikeId && (
          <p className="mb-3 text-red-800">
            เลขทะเบียน &ldquo;{query}&rdquo; ไม่ถูกต้อง — เลขทะเบียนนิติบุคคลต้องมี 13 หลักและผ่านการตรวจสอบหลักสุดท้าย
          </p>
        )}

        {query && !looksLikeId && results.length === 0 && (
          <p className="text-wiki-muted">
            ไม่พบผลลัพธ์สำหรับ &ldquo;{query}&rdquo;
            {getProvider() === "gdx" && " — ขณะนี้รองรับการค้นหาด้วยเลขทะเบียนนิติบุคคล 13 หลักเท่านั้น"}
            {getProvider() === "opend" && " — การค้นด้วยชื่อครอบคลุมนิติบุคคลที่จดทะเบียนใหม่ใน 12 เดือนล่าสุด"}
            {getProvider() === "db" &&
              " — การค้นด้วยชื่อครอบคลุมนิติบุคคลที่จดทะเบียนตั้งแต่ปี 2565 หากเป็นบริษัทที่จดทะเบียนก่อนหน้านั้น โปรดค้นด้วยเลขทะเบียนนิติบุคคล 13 หลัก"}
          </p>
        )}

        {results.length > 0 && (
          <>
            <p className="mb-2 text-sm text-wiki-muted">พบ {results.length} รายการ</p>
            <ul className="divide-y divide-wiki-border-light">
              {results.map((p) => (
                <li key={p.id} className="py-3">
                  <Link href={`/company/${p.id}`} className="text-lg">
                    {p.nameTh}
                  </Link>
                  {p.nameEn && <span className="ml-2 text-sm text-wiki-muted">{p.nameEn}</span>}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-wiki-muted">
                    <span className="font-mono">{formatJuristicId(p.id)}</span>·<span>{p.type}</span>·
                    <span>{p.address.province}</span>
                    <StatusBadge status={p.status} text={p.statusText} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </main>
  );
}
