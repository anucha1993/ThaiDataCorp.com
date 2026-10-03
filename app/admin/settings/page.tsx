import { saveSettings } from "@/app/admin/actions";
import AdminCard from "@/components/AdminCard";
import { Notice, inputCls, primaryButtonCls } from "@/components/Panel";
import { isMailConfigured } from "@/lib/mailer";
import { getSetting, SETTINGS } from "@/lib/settings";
import { getPlans } from "@/lib/plans";
import { checkStorage } from "@/lib/uploads";

type Props = { searchParams: Promise<{ ok?: string }> };

export default async function SettingsPage({ searchParams }: Props) {
  const q = await searchParams;
  const [values, plans, storage] = await Promise.all([
    Promise.all(SETTINGS.map(async (s) => [s.key, (await getSetting(s.key)) ?? ""] as const)).then(Object.fromEntries),
    getPlans(),
    checkStorage(),
  ]);

  const envStatus = [
    { k: "ฐานข้อมูล (DB_HOST)", ok: Boolean(process.env.DB_HOST) },
    { k: "อีเมล (SMTP_HOST/SMTP_USER)", ok: isMailConfigured() },
    { k: "Open-D (OPEND_API_KEY)", ok: Boolean(process.env.OPEND_API_KEY) },
    { k: "GDX (GDX_CONSUMER_KEY)", ok: Boolean(process.env.GDX_CONSUMER_KEY) },
    { k: "ผู้ดูแลหลัก (ADMIN_EMAILS)", ok: Boolean(process.env.ADMIN_EMAILS) },
    { k: "เข้าสู่ระบบด้วย Google (GOOGLE_CLIENT_ID/SECRET)", ok: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) },
  ];

  return (
    <>
      <AdminCard title="ตั้งค่า">
        {q.ok === "saved" && <Notice tone="ok">บันทึกแล้ว</Notice>}
        <form action={saveSettings} className="flex max-w-xl flex-col gap-3 text-sm">
          {SETTINGS.map((s) => (
            <label key={s.key} className="flex flex-col">
              <b>{s.label}</b>
              <span className="text-xs text-wiki-muted">
                {s.help}
                {s.env && ` · ถ้าเว้นว่างจะใช้ค่า ${s.env} จาก env`}
              </span>
              {s.type === "toggle" ? (
                <span className="mt-1 flex items-center gap-2">
                  <input type="checkbox" name={s.key} defaultChecked={values[s.key] === "1"} />
                  {values[s.key] === "1" ? "เปิดอยู่ — กำลังเก็บเงิน" : "ปิดอยู่ — สมาชิกใช้งานฟรีทั้งหมด"}
                </span>
              ) : s.type === "plan" ? (
                <select name={s.key} defaultValue={values[s.key] || "business"} className={inputCls}>
                  {Object.values(plans).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ติดตาม {p.maxWatches}, CSV {p.exportRows ? `${p.exportRows} แถว` : "ไม่ได้"}
                      {p.exportContracts ? ", CSV สัญญา" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input name={s.key} defaultValue={values[s.key]} className={inputCls} />
              )}
            </label>
          ))}
          <button type="submit" className={`${primaryButtonCls} self-start`}>
            บันทึก
          </button>
        </form>
      </AdminCard>
      <AdminCard title="สถานะการตั้งค่าในไฟล์ env (แก้ได้ที่ .env.local หรือ Environment Variables ของ Plesk)">
        <ul className="space-y-1 text-sm">
          {envStatus.map((e) => (
            <li key={e.k}>
              {e.ok ? "✅" : "⚠️"} {e.k} {e.ok ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้งค่า"}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-wiki-muted">ค่าลับ (รหัสผ่าน DB/SMTP, API key) เก็บใน env เท่านั้น ไม่แสดงและไม่แก้จากหน้าเว็บ</p>
      </AdminCard>
      <AdminCard title="ตรวจระบบเก็บไฟล์ (ทดสอบเขียน-ลบจริงทุกครั้งที่เปิดหน้านี้)">
        <ul className="space-y-1 text-sm">
          {storage.map((c) => (
            <li key={c.k}>
              {c.ok ? "✅" : "❌"} {c.k} <span className="text-xs text-wiki-muted">— {c.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-wiki-muted">
          ถ้าโฟลเดอร์เอกสารเขียนไม่ได้: ตั้ง STORAGE_DIR ใน env ให้ชี้โฟลเดอร์ที่แอปมีสิทธิ์เขียน (แนะนำ /var/www/vhosts/โดเมน/private/storage) แล้ว Restart App
        </p>
      </AdminCard>
    </>
  );
}
