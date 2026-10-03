import { deletePlan, savePlan } from "@/app/admin/actions";
import AdminCard from "@/components/AdminCard";
import { Notice, buttonCls, inputCls, primaryButtonCls } from "@/components/Panel";
import { listPlanRows } from "@/lib/admin-repo";
import { formatNumber } from "@/lib/format";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MSG: Record<string, { tone: "ok" | "error"; text: string }> = {
  "ok:saved": { tone: "ok", text: "บันทึกแพ็กเกจแล้ว หน้าราคาจะอัปเดตภายใน 1 นาที" },
  "ok:deleted": { tone: "ok", text: "ลบแพ็กเกจแล้ว" },
  "error:slug": { tone: "error", text: "รหัสแพ็กเกจต้องเป็นตัวอักษรอังกฤษพิมพ์เล็ก/ตัวเลข/ขีด 2–16 ตัว และขึ้นต้นด้วยตัวอักษร" },
  "error:free": { tone: "error", text: "ลบแพ็กเกจฟรีไม่ได้" },
  "error:in-use": { tone: "error", text: "ลบไม่ได้ เพราะมีสมาชิกหรือคำสั่งซื้อใช้แพ็กเกจนี้ — ปิดการขาย (ไม่ติ๊ก “เปิดขาย”) แทน" },
};

function PlanForm({ p, isNew = false }: { p?: Record<string, unknown>; isNew?: boolean }) {
  const v = (k: string, d: unknown = "") => String(p?.[k] ?? d);
  const isFree = p?.id === "free";
  return (
    <form action={savePlan} className="grid gap-2 text-sm md:grid-cols-4">
      <label className="flex flex-col">
        รหัส (ใช้ในระบบ)
        <input name="id" defaultValue={v("id")} readOnly={!isNew} required className={`${inputCls} font-mono ${!isNew ? "bg-wiki-bg" : ""}`} />
      </label>
      <label className="flex flex-col">
        ชื่อที่แสดง
        <input name="name" defaultValue={v("name")} required className={inputCls} />
      </label>
      <label className="flex flex-col">
        ราคา (บาท/เดือน)
        <input name="price" type="number" min={0} defaultValue={v("price", 0)} disabled={isFree} className={inputCls} />
      </label>
      <label className="flex flex-col">
        ทดลองใช้ฟรี (วัน, 0 = ไม่มี)
        <input name="trial_days" type="number" min={0} max={90} defaultValue={v("trial_days", 0)} disabled={isFree} className={inputCls} />
      </label>
      <label className="flex flex-col">
        ลำดับการแสดง
        <input name="sort" type="number" min={0} defaultValue={v("sort", 10)} className={inputCls} />
      </label>
      <label className="flex flex-col">
        ติดตามได้ (รายการ)
        <input name="max_watches" type="number" min={0} defaultValue={v("max_watches", 3)} className={inputCls} />
      </label>
      <label className="flex flex-col">
        เงื่อนไขแจ้งเตือน (เงื่อนไข)
        <input name="max_saved_searches" type="number" min={0} defaultValue={v("max_saved_searches", 1)} className={inputCls} />
      </label>
      <label className="flex flex-col">
        แจ้งเตือนทุก (วัน)
        <input name="alert_every_days" type="number" min={1} defaultValue={v("alert_every_days", 7)} className={inputCls} />
      </label>
      <label className="flex flex-col">
        CSV สูงสุด (แถว/ไฟล์, 0 = ปิด)
        <input name="export_rows" type="number" min={0} defaultValue={v("export_rows", 0)} className={inputCls} />
      </label>
      <label className="flex flex-col md:col-span-3">
        รายละเอียดที่แสดงในหน้าราคา (บรรทัดละ 1 ข้อ)
        <textarea name="features" rows={4} defaultValue={v("features")} className={inputCls} />
      </label>
      <div className="flex flex-col justify-end gap-2 md:col-span-4 md:flex-row md:items-center md:justify-start md:gap-4">
        <label className="flex items-center gap-1">
          <input type="checkbox" name="export_contracts" defaultChecked={Number(p?.export_contracts ?? 0) === 1} /> CSV สัญญาภาครัฐ
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="active" defaultChecked={isNew || Number(p?.active ?? 1) === 1} disabled={isFree} /> เปิดขาย
        </label>
        <button type="submit" className={primaryButtonCls}>
          {isNew ? "สร้างแพ็กเกจ" : "บันทึก"}
        </button>
      </div>
    </form>
  );
}

export default async function PlansPage({ searchParams }: Props) {
  const q = await searchParams;
  const msg = one(q.ok) ? MSG[`ok:${one(q.ok)}`] : one(q.error) ? MSG[`error:${one(q.error)}`] : undefined;
  const plans = await listPlanRows();

  return (
    <>
      <AdminCard title="แพ็กเกจ">
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <p className="mb-3 text-sm text-wiki-muted">
          แก้ราคาแล้วมีผลกับคำสั่งซื้อใหม่เท่านั้น (คำสั่งซื้อเดิมใช้ยอดตอนสั่ง) · สมาชิกที่ซื้อแพ็กเกจที่ปิดขายแล้วยังใช้สิทธิ์ได้จนหมดอายุ
        </p>
        <div className="space-y-4">
          {plans.map((p) => (
            <div key={p.id} id={`plan-${p.id}`} className="border border-wiki-border-light p-3">
              <div className="mb-2 flex items-center gap-2">
                <b>{p.name}</b>
                <span className="text-xs text-wiki-muted">
                  {p.price ? `${formatNumber(p.price)} ฿/เดือน` : "ฟรี"} · สมาชิกที่ใช้งานอยู่ {formatNumber(Number(p.members))} ราย
                  {Number(p.trial_days) > 0 &&
                    ` (กำลังทดลอง ${formatNumber(Number(p.trialing))}) · ทดลองฟรี ${p.trial_days} วัน — ใช้สิทธิ์แล้ว ${formatNumber(Number(p.trials_total))} ราย`}
                  {Number(p.active) !== 1 && " · ปิดขาย"}
                </span>
                {p.id !== "free" && (
                  <form action={deletePlan} className="ml-auto">
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className={`${buttonCls} py-0.5 text-xs text-red-800`}>
                      ลบ
                    </button>
                  </form>
                )}
              </div>
              <PlanForm p={p} />
            </div>
          ))}
        </div>
      </AdminCard>
      <AdminCard title="สร้างแพ็กเกจใหม่">
        <PlanForm isNew />
      </AdminCard>
    </>
  );
}
