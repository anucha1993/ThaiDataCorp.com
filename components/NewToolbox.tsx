import { GuestOnly } from "@/components/MemberGate";
import SearchableSelect from "@/components/SearchableSelect";
import { formatNumber } from "@/lib/format";

const selectCls =
  "max-w-full min-w-0 border border-wiki-border bg-white px-2 py-1";

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
    // ย่อไว้เป็นค่าเริ่มต้น — เปิดเมื่อกำลังกรองจังหวัด/ประเภทอยู่ (ให้เห็นว่ากรองอะไรไว้)
    <details
      open={Boolean(province || tsic)}
      className="my-4 border border-wiki-border bg-wiki-bg text-sm"
    >
      <summary className="cursor-pointer px-3 py-2 font-bold">
        🔎 กรองรายชื่อ / ดาวน์โหลด CSV{" "}
        <GuestOnly>
          <span className="font-normal text-wiki-muted">{note}</span>
        </GuestOnly>
      </summary>
      <form
        action="/new/go"
        method="get"
        className="border-t border-wiki-border p-3"
      >
        <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
          <label htmlFor="tb-ym">เดือนที่จดทะเบียน</label>
          <SearchableSelect
            id="tb-ym"
            name="ym"
            options={months.map((m) => ({
              value: m.ym,
              label: `${m.label} (${formatNumber(m.count)})`,
            }))}
            defaultValue={ym}
            className={selectCls}
          />
          <label htmlFor="tb-province">จังหวัด</label>
          <SearchableSelect
            id="tb-province"
            name="province"
            options={provinces.map((p) => ({ value: p, label: p }))}
            defaultValue={province ?? ""}
            emptyLabel="ทุกจังหวัด"
            className={selectCls}
          />
          <label htmlFor="tb-tsic">ประเภทธุรกิจ</label>
          <SearchableSelect
            id="tb-tsic"
            name="tsic"
            options={tsics.map((t) => ({
              value: t.code,
              label: `${t.name} (${formatNumber(t.count)})`,
            }))}
            defaultValue={tsic ?? ""}
            emptyLabel="ทุกประเภท"
            className={selectCls}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            className="border border-wiki-link bg-wiki-link px-4 py-1.5 font-bold text-white hover:opacity-90"
          >
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
          รายการประเภทธุรกิจแสดงตามเดือน{province ? "และจังหวัด" : ""}
          ที่เลือกอยู่ตอนนี้ — เปลี่ยนเดือนแล้วกด &ldquo;ดูรายชื่อ&rdquo;
          เพื่อดูประเภทของเดือนนั้น
        </p>
      </form>
    </details>
  );
}
