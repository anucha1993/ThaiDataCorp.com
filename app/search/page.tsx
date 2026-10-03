import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProvider, isValidJuristicId, normalizeJuristicIdInput, searchCompaniesByName } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { formatJuristicId, formatNumber, formatThaiDate } from "@/lib/format";
import {
  advancedSearch,
  filtersToQuery,
  hasAdvanced,
  JURISTIC_TYPES,
  listProvinces,
  listTsicDivisions,
  parseFilters,
  SEARCH_PAGE_SIZE,
  SORTS,
  type SearchFilters,
} from "@/lib/search-repo";
import { primaryButtonCls } from "@/components/Panel";
import StatusBadge from "@/components/StatusBadge";
import type { JuristicProfile } from "@/types/company";

// หน้าผลค้นหาไม่ควรถูก index (เนื้อหาบาง/ซ้ำ) แต่ให้ bot ตามลิงก์ไปหน้าบริษัทได้
export const metadata: Metadata = {
  title: "ค้นหานิติบุคคล",
  robots: { index: false, follow: true },
  alternates: { canonical: "/search" },
};

type SearchProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const fieldCls = "w-full min-w-0 border border-wiki-border bg-white px-2 py-1";

export default async function SearchPage({ searchParams }: SearchProps) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const query = f.q ?? "";
  const page = Math.max(1, Math.min(200, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1));

  // พิมพ์เลขทะเบียน 13 หลัก → ไปหน้าบริษัททันที
  const asId = normalizeJuristicIdInput(query);
  if (isValidJuristicId(asId)) redirect(`/company/${asId}`);

  const db = getProvider() === "db";
  const user = db ? await getCurrentUser() : null;
  const advancedOn = db && Boolean(user);
  const wantsAdvanced = hasAdvanced(f);
  const looksLikeId = /^\d[\d\s-]*$/.test(query);

  // สมาชิก: ค้นด้วยตัวกรองครบ + แบ่งหน้า · ทั่วไป: ค้นด้วยชื่ออย่างเดียว (30 รายการแรก)
  let results: JuristicProfile[] = [];
  let total = 0;
  if (advancedOn && (query || wantsAdvanced) && !looksLikeId) {
    ({ rows: results, total } = await advancedSearch(f, page));
  } else if (query) {
    results = await searchCompaniesByName(query);
    total = results.length;
  }
  const searched = Boolean(query) || (advancedOn && wantsAdvanced);
  const pages = Math.ceil(total / SEARCH_PAGE_SIZE);
  const [divisions, provinces] = db ? await Promise.all([listTsicDivisions(), listProvinces()]) : [[], []];

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem]">ค้นหานิติบุคคล</h1>

        <form action="/search" method="get" role="search" className="my-4">
          <div className="flex max-w-2xl">
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
          </div>

          {db && (
            <details open={advancedOn && (wantsAdvanced || !query)} className="mt-3 border border-wiki-border bg-wiki-bg">
              <summary className="cursor-pointer px-3 py-2 text-sm font-bold">
                🔎 ค้นหาขั้นสูง{" "}
                <span className="font-normal text-wiki-muted">— ประเภทธุรกิจ จังหวัด สถานะ วันจดทะเบียน ทุน และงานภาครัฐ</span>
              </summary>
              {advancedOn ? (
                <AdvancedFields f={f} divisions={divisions} provinces={provinces} />
              ) : (
                <div className="border-t border-wiki-border px-3 py-4 text-center text-sm">
                  <p className="mb-3">ค้นหาขั้นสูงสำหรับสมาชิก — สมัครฟรี ด้วยอีเมลหรือ Google</p>
                  <Link href={`/register?next=${encodeURIComponent(`/search?${filtersToQuery(f)}`)}`} className={primaryButtonCls}>
                    สมัครสมาชิกฟรี
                  </Link>
                  <p className="mt-3">
                    มีบัญชีแล้ว? <Link href={`/login?next=${encodeURIComponent(`/search?${filtersToQuery(f)}`)}`}>เข้าสู่ระบบ</Link>
                  </p>
                </div>
              )}
            </details>
          )}
        </form>

        {!searched && (
          <p className="text-wiki-muted">
            พิมพ์ชื่อบริษัท หรือเลขทะเบียนนิติบุคคล 13 หลัก{advancedOn && " หรือเลือกตัวกรองในค้นหาขั้นสูง"} เพื่อเริ่มค้นหา
          </p>
        )}

        {!advancedOn && wantsAdvanced && db && (
          <p className="mb-3 text-sm text-red-800">ตัวกรองขั้นสูงใช้ได้เฉพาะสมาชิก — แสดงผลค้นหาด้วยชื่ออย่างเดียว</p>
        )}

        {query && looksLikeId && (
          <p className="mb-3 text-red-800">
            เลขทะเบียน &ldquo;{query}&rdquo; ไม่ถูกต้อง — เลขทะเบียนนิติบุคคลต้องมี 13 หลักและผ่านการตรวจสอบหลักสุดท้าย
          </p>
        )}

        {searched && !looksLikeId && results.length === 0 && (
          <p className="text-wiki-muted">
            ไม่พบผลลัพธ์{query && <> สำหรับ &ldquo;{query}&rdquo;</>}
            {getProvider() === "gdx" && " — ขณะนี้รองรับการค้นหาด้วยเลขทะเบียนนิติบุคคล 13 หลักเท่านั้น"}
            {getProvider() === "opend" && " — การค้นด้วยชื่อครอบคลุมนิติบุคคลที่จดทะเบียนใหม่ใน 12 เดือนล่าสุด"}
            {db &&
              " — ข้อมูลครอบคลุมนิติบุคคลที่จดทะเบียนตั้งแต่ปี 2565 หากเป็นบริษัทที่จดทะเบียนก่อนหน้านั้น โปรดค้นด้วยเลขทะเบียนนิติบุคคล 13 หลัก"}
          </p>
        )}

        {results.length > 0 && (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-wiki-muted">
                พบ {formatNumber(total)} รายการ
                {pages > 1 && ` · หน้า ${page} / ${formatNumber(pages)}`}
                {!advancedOn && total >= 30 && " (แสดง 30 รายการแรก — สมาชิกดูได้ทั้งหมด)"}
              </span>
              {advancedOn && (
                <a href={`/export/search?${filtersToQuery(f)}`} rel="nofollow" className="font-bold">
                  ⬇ ดาวน์โหลดผลค้นหาเป็น CSV
                </a>
              )}
            </div>
            <ul className="divide-y divide-wiki-border-light">
              {results.map((p) => (
                <li key={p.id} className="py-3">
                  <Link href={`/company/${p.id}`} className="text-lg">
                    {p.nameTh}
                  </Link>
                  {p.nameEn && <span className="ml-2 text-sm text-wiki-muted">{p.nameEn}</span>}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-wiki-muted">
                    <span className="font-mono">{formatJuristicId(p.id)}</span>·<span>{p.type}</span>·<span>{p.address.province}</span>
                    {p.registerDate && <>· <span>จดทะเบียน {formatThaiDate(p.registerDate)}</span></>}
                    {p.registerCapital > 0 && <>· <span>ทุน {formatNumber(p.registerCapital)} บาท</span></>}
                    <StatusBadge status={p.status} text={p.statusText} />
                  </div>
                  {p.tsic?.description && <div className="text-sm text-wiki-muted">{p.tsic.description}</div>}
                </li>
              ))}
            </ul>
            {advancedOn && pages > 1 && (
              <nav aria-label="หน้า" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                {page > 1 && <Link href={`/search?${filtersToQuery(f, { page: String(page - 1) })}`}>← ก่อนหน้า</Link>}
                <span className="text-wiki-muted">
                  หน้า {page} / {formatNumber(pages)}
                </span>
                {page < pages && page < 200 && <Link href={`/search?${filtersToQuery(f, { page: String(page + 1) })}`}>ถัดไป →</Link>}
              </nav>
            )}
          </>
        )}
      </article>
    </main>
  );
}

/** ช่องตัวกรองขั้นสูง (อยู่ในฟอร์มเดียวกับช่องค้นหาชื่อ) — HTML form ล้วน ไม่ต้องใช้ JavaScript */
function AdvancedFields({
  f,
  divisions,
  provinces,
}: {
  f: SearchFilters;
  divisions: Awaited<ReturnType<typeof listTsicDivisions>>;
  provinces: string[];
}) {
  const tsicIsDivision = f.tsic?.length === 2;
  return (
    <div className="border-t border-wiki-border px-3 py-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-2">
          ประเภทธุรกิจ (หมวด TSIC)
          <select name="tsic" defaultValue={tsicIsDivision ? f.tsic : ""} className={fieldCls}>
            <option value="">ทุกประเภท</option>
            {divisions.map((s) => (
              <optgroup key={s.code} label={`${s.code} — ${s.name}`}>
                {s.divisions.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} {d.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          หรือรหัส TSIC เจาะจง (2–5 หลัก)
          <input
            name="tsic_code"
            inputMode="numeric"
            pattern="\d{2,5}"
            defaultValue={f.tsic && !tsicIsDivision ? f.tsic : ""}
            placeholder="เช่น 41001"
            className={fieldCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          จังหวัด
          <select name="province" defaultValue={f.province ?? ""} className={fieldCls}>
            <option value="">ทุกจังหวัด</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          ประเภทนิติบุคคล
          <select name="type" defaultValue={f.type ?? ""} className={fieldCls}>
            <option value="">ทุกประเภท</option>
            {JURISTIC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          สถานะ
          <select name="status" defaultValue={f.status ?? ""} className={fieldCls}>
            <option value="">ทั้งหมด</option>
            <option value="active">ยังดำเนินกิจการ</option>
            <option value="dissolved">เลิก / ร้าง / ชำระบัญชีแล้ว</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          จดทะเบียนตั้งแต่วันที่
          <input type="date" name="from" defaultValue={f.from ?? ""} className={fieldCls} />
        </label>
        <label className="flex flex-col gap-1">
          ถึงวันที่
          <input type="date" name="to" defaultValue={f.to ?? ""} className={fieldCls} />
        </label>
        <label className="flex flex-col gap-1">
          จัดเรียง
          <select name="sort" defaultValue={f.sort} className={fieldCls}>
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          ทุนจดทะเบียนขั้นต่ำ (บาท)
          <input name="cap_min" inputMode="numeric" defaultValue={f.capMin ?? ""} placeholder="เช่น 1000000" className={fieldCls} />
        </label>
        <label className="flex flex-col gap-1">
          ทุนจดทะเบียนสูงสุด (บาท)
          <input name="cap_max" inputMode="numeric" defaultValue={f.capMax ?? ""} placeholder="ไม่จำกัด" className={fieldCls} />
        </label>
        <label className="flex items-center gap-2 self-end pb-1">
          <input type="checkbox" name="gov" value="1" defaultChecked={f.gov} />
          เคยได้งานภาครัฐ (e-GP)
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" className="border border-wiki-link bg-wiki-link px-4 py-1.5 font-bold text-white hover:opacity-90">
          ค้นหา
        </button>
        <Link href="/search">ล้างตัวกรอง</Link>
        <span className="text-xs text-wiki-muted">ไม่ต้องกรอกชื่อก็ได้ — เลือกแค่ตัวกรองแล้วกดค้นหา</span>
      </div>
    </div>
  );
}
