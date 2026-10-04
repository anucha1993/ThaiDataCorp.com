import Ad from "@/components/Ad";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ChangeValue from "@/components/ChangeValue";
import { getProvider } from "@/lib/api";
import { CHANGE_FIELDS, CHANGE_LABELS, countChanges, isChangeField, listChanges } from "@/lib/changes-repo";
import { formatNumber, SITE_NAME } from "@/lib/format";

export const revalidate = 600;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const field = one(sp.type);
  const label = isChangeField(field) ? CHANGE_LABELS[field] : null;
  const filtered = Boolean(label || one(sp.page));
  return {
    title: label ? `${label} — ความเคลื่อนไหวนิติบุคคลล่าสุด` : "ความเคลื่อนไหวนิติบุคคล — บริษัทเปลี่ยนชื่อ เพิ่มทุน เลิกกิจการ ล่าสุด",
    description:
      "ติดตามบริษัทไทยที่เปลี่ยนชื่อ เพิ่มหรือลดทุนจดทะเบียน เปลี่ยนสถานะ เลิกกิจการ ย้ายที่ตั้ง หรือเปลี่ยนประเภทธุรกิจ อัปเดตทุกวันจากข้อมูลกรมพัฒนาธุรกิจการค้า",
    alternates: { canonical: "/changes" },
    // หน้ากรอง/หน้าถัดไปไม่ต้อง index (เนื้อหาซ้ำกับหน้าหลัก)
    ...(filtered && { robots: { index: false, follow: true } }),
  };
}

function thaiDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
}

export default async function ChangesPage({ searchParams }: Props) {
  if (getProvider() !== "db") notFound();
  const sp = await searchParams;
  const rawField = one(sp.type);
  const field = isChangeField(rawField) ? rawField : undefined;
  const page = Math.max(1, Math.min(200, Number(one(sp.page)) || 1));
  const [week, { items, hasNext }] = await Promise.all([countChanges(7), listChanges({ field, page })]);

  const href = (f?: string, p?: number) => {
    const q = new URLSearchParams();
    if (f) q.set("type", f);
    if (p && p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/changes${s ? `?${s}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › ความเคลื่อนไหวนิติบุคคล
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] sm:text-[2rem]">ความเคลื่อนไหวนิติบุคคล</h1>
        <p className="mt-3 leading-7">
          บริษัทและห้างหุ้นส่วนที่เปลี่ยนชื่อ เปลี่ยนทุนจดทะเบียน เปลี่ยนสถานะ (เช่น เลิกกิจการ ร้าง) ย้ายที่ตั้ง หรือเปลี่ยนประเภทธุรกิจ
          — {SITE_NAME} ตรวจข้อมูลกับกรมพัฒนาธุรกิจการค้าทุกวัน และแสดงทุกครั้งที่พบการเปลี่ยนแปลง
        </p>

        <section aria-label="สรุป 7 วัน" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {CHANGE_FIELDS.map((f) => (
            <Link
              key={f}
              href={href(f)}
              className={`border px-3 py-2 text-wiki-text! hover:no-underline hover:border-wiki-link ${f === field ? "border-wiki-link bg-wiki-bg" : "border-wiki-border-light"}`}
            >
              <div className="text-xl font-bold tabular-nums">{formatNumber(week[f])}</div>
              <div className="text-xs text-wiki-muted">{CHANGE_LABELS[f]} (7 วัน)</div>
            </Link>
          ))}
        </section>

        <nav aria-label="กรองตามประเภท" className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href={href()} className={`border px-3 py-1 ${!field ? "border-wiki-link font-bold" : "border-wiki-border-light"}`}>
            ทั้งหมด
          </Link>
          {CHANGE_FIELDS.map((f) => (
            <Link key={f} href={href(f)} className={`border px-3 py-1 ${f === field ? "border-wiki-link font-bold" : "border-wiki-border-light"}`}>
              {CHANGE_LABELS[f]}
            </Link>
          ))}
        </nav>

        <Ad page="changes" placement="content_top" />
        <h2 className="wiki-h2">{field ? CHANGE_LABELS[field] : "ล่าสุด"}</h2>
        {items.length === 0 ? (
          <p className="text-wiki-muted">ยังไม่มีรายการ — ระบบกำลังทยอยตรวจข้อมูลกับกรมพัฒนาธุรกิจการค้า</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="wikitable w-full">
              <thead>
                <tr>
                  <th scope="col">ตรวจพบเมื่อ</th>
                  <th scope="col">นิติบุคคล</th>
                  <th scope="col">การเปลี่ยนแปลง</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap text-sm">{thaiDateTime(c.detectedAt)}</td>
                    <td>
                      <Link href={`/company/${c.juristicId}`}>{c.name}</Link>
                      {c.province && <div className="text-xs text-wiki-muted">{c.province}</div>}
                    </td>
                    <td className="text-sm">
                      <div className="font-bold">{CHANGE_LABELS[c.field]}</div>
                      <ChangeValue field={c.field} oldValue={c.oldValue} newValue={c.newValue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex justify-between text-sm">
          {page > 1 ? <Link href={href(field, page - 1)}>← ใหม่กว่า</Link> : <span />}
          {hasNext && <Link href={href(field, page + 1)}>เก่ากว่า →</Link>}
        </div>

        <p className="mt-6 text-xs text-wiki-muted">
          "ตรวจพบเมื่อ" คือวันที่ {SITE_NAME} พบการเปลี่ยนแปลงจากการตรวจกับ DBD Open API ของกรมพัฒนาธุรกิจการค้า ไม่ใช่วันที่จดทะเบียนแก้ไขจริง
          บริษัทที่ระบบเพิ่งตรวจเป็นครั้งแรกอาจเปลี่ยนแปลงไปนานแล้ว ตรวจสอบเอกสารทางการได้ที่{" "}
          <a href="https://datawarehouse.dbd.go.th" rel="noopener nofollow" target="_blank">
            DBD DataWarehouse+
          </a>
        </p>
        <Ad page="changes" placement="content_bottom" />
      </article>
    </main>
  );
}
