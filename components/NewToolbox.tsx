import { GuestOnly } from "@/components/MemberGate";
import { formatNumber } from "@/lib/format";

const selectCls = "max-w-full min-w-0 border border-wiki-border bg-white px-2 py-1";

/**
 * กล่องเครื่องมือบริษัทเปิดใหม่: เลือกเดือน / จังหวัด / ประเภทธุรกิจ → ดูรายชื่อ หรือดาวน์โหลด CSV
 * HTML form ล้วน (ไม่ต้องใช้ JavaScript) — ปุ่มดูรายชื่อไป /new/go, ปุ่ม CSV ไป /export/new (ด้วย formAction)
 */
export default function NewToolbox({
  months,
  provinces,
  tsics,
  ym,
  province,
  tsic,
  note,
}: {
  months: Array<{ ym: string; label: string; count: number }>;
  provinces: string[];
  tsics: Array<{ code: string; name: string; count: number }>;
  ym: string;
  province?: string;
  tsic?: string;
  /** ข้อความบอกว่าเครื่องมือนี้สำหรับใคร เช่น "(สำหรับสมาชิก — สมัครฟรี)" */
  note: string;
}) {
  return (
    <form action="/new/go" method="get" className="my-4 border border-wiki-border bg-wiki-bg p-3 text-sm">
      <div className="mb-2 font-bold">
        🔎 กรองรายชื่อ / ดาวน์โหลด CSV{" "}
        <GuestOnly>
          <span className="font-normal text-wiki-muted">{note}</span>
        </GuestOnly>
      </div>
      <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
        <label htmlFor="tb-ym">เดือนที่จดทะเบียน</label>
        <select id="tb-ym" name="ym" defaultValue={ym} className={selectCls}>
          {months.map((m) => (
            <option key={m.ym} value={m.ym}>
              {m.label} ({formatNumber(m.count)})
            </option>
          ))}
        </select>
        <label htmlFor="tb-province">จังหวัด</label>
        <select id="tb-province" name="province" defaultValue={province ?? ""} className={selectCls}>
          <option value="">ทุกจังหวัด</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label htmlFor="tb-tsic">ประเภทธุรกิจ</label>
        <select id="tb-tsic" name="tsic" defaultValue={tsic ?? ""} className={selectCls}>
          <option value="">ทุกประเภท</option>
          {tsics.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name} ({formatNumber(t.count)})
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className="border border-wiki-link bg-wiki-link px-4 py-1.5 font-bold text-white hover:opacity-90">
          ดูรายชื่อ
        </button>
        <button
          type="submit"
          formAction="/export/new"
          className="border border-wiki-border bg-white px-4 py-1.5 font-bold text-wiki-text hover:bg-wiki-header"
        >
          ⬇ ดาวน์โหลด CSV
        </button>
      </div>
      <p className="mt-2 text-xs text-wiki-muted">
        รายการประเภทธุรกิจแสดงตามเดือน{province ? "และจังหวัด" : ""}ที่เลือกอยู่ตอนนี้ — เปลี่ยนเดือนแล้วกด &ldquo;ดูรายชื่อ&rdquo;
        เพื่อดูประเภทของเดือนนั้น
      </p>
    </form>
  );
}
