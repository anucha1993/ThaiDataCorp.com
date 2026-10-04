import Link from "next/link";
import AdminCard from "@/components/AdminCard";
import { buttonCls, inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { ViewsLine } from "@/components/ViewsChart";
import { disconnectAdsense, saveAdsConfig, syncAdsenseNow } from "@/app/admin/ads/actions";
import { getAdsConfig } from "@/lib/ads";
import { AD_PAGE_TYPES, AD_PLACEMENTS, ALWAYS_EXCLUDED, type AdPageType, type AdPlacement } from "@/lib/ads-config";
import { getAdsenseSummary } from "@/lib/adsense-repo";
import { formatNumber, SITE_URL } from "@/lib/format";
import { isGoogleConfigured } from "@/lib/google";
import { getSetting } from "@/lib/settings";
import { utcToThai } from "@/lib/jobs";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const MSG: Record<string, { tone: "ok" | "error"; text: string }> = {
  "ok:saved": { tone: "ok", text: "บันทึกแล้ว — หน้าเว็บทั้งหมดอัปเดตตามการตั้งค่าใหม่" },
  "ok:connected": { tone: "ok", text: "เชื่อมต่อบัญชี AdSense แล้ว — ระบบกำลังดึงรายงานรอบแรก (ภายใน 5 นาที)" },
  "ok:disconnected": { tone: "ok", text: "ยกเลิกการเชื่อมต่อแล้ว (ข้อมูลรายงานเดิมยังอยู่)" },
  "ok:sync-queued": { tone: "ok", text: "สั่งดึงรายงานแล้ว — ตัวจัดคิวจะรันภายใน 5 นาที" },
  "error:publisher": { tone: "error", text: "Publisher ID ไม่ถูกต้อง — รูปแบบ ca-pub- ตามด้วยตัวเลข 16 หลัก" },
  "error:need-publisher": { tone: "error", text: "ต้องใส่ Publisher ID ก่อนเปิดโฆษณา" },
  "error:slot": { tone: "error", text: "รหัส ad unit (data-ad-slot) ต้องเป็นตัวเลข 6–12 หลัก" },
  "error:google-off": { tone: "error", text: "ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" },
  "error:denied": { tone: "error", text: "ไม่ได้อนุญาตการเข้าถึง AdSense" },
  "error:state": { tone: "error", text: "การเชื่อมต่อหมดอายุ ลองใหม่อีกครั้ง" },
  "error:no-refresh": { tone: "error", text: "Google ไม่ส่งสิทธิ์ระยะยาวมา — ไปที่ myaccount.google.com/permissions ลบสิทธิ์ ThaiDataCorp แล้วเชื่อมต่อใหม่" },
  "error:no-account": { tone: "error", text: "บัญชี Google นี้ไม่มีบัญชี AdSense — ใช้บัญชีที่สมัคร AdSense" },
  "error:failed": { tone: "error", text: "เชื่อมต่อไม่สำเร็จ — ตรวจว่าเปิด AdSense Management API และเพิ่ม redirect URI แล้ว" },
};

const thToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const minusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86400_000).toISOString().slice(0, 10);
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** ตรวจว่าไฟล์โค้ดถูกเปิดจากภายนอกได้หรือไม่ (Document Root ผิด) — เสี่ยงทั้งความปลอดภัยและไม่ผ่านรีวิว AdSense */
async function sourceExposed(): Promise<boolean | null> {
  if (!SITE_URL.startsWith("https://")) return null;
  try {
    const r = await fetch(`${SITE_URL}/package.json`, { cache: "no-store", signal: AbortSignal.timeout(5000), redirect: "manual" });
    return r.status === 200 && (await r.text()).includes('"next"');
  } catch {
    return null;
  }
}

export default async function AdsAdminPage({ searchParams }: Props) {
  const q = await searchParams;
  const msg = one(q.ok) ? MSG[`ok:${one(q.ok)}`] : one(q.error) ? MSG[`error:${one(q.error)}`] : undefined;
  const days = [7, 30, 90, 365].includes(Number(one(q.days))) ? Number(one(q.days)) : 30;
  const to = thToday();
  const from = minusDays(to, days - 1);

  const [cfg, account, accountName, syncedAt, report, exposed] = await Promise.all([
    getAdsConfig(),
    getSetting("adsense_account"),
    getSetting("adsense_account_name"),
    getSetting("adsense_synced_at"),
    getAdsenseSummary(from, to).catch(() => null),
    sourceExposed(),
  ]);
  const connected = Boolean(account);

  const checks: Array<{ ok: boolean | null; label: string; note?: React.ReactNode }> = [
    { ok: SITE_URL.startsWith("https://"), label: "เว็บใช้ HTTPS" },
    { ok: exposed === null ? null : !exposed, label: "ไฟล์โค้ดไม่ถูกเปิดจากภายนอก", note: exposed ? "เปิด package.json ได้ — ตั้ง Document Root เป็น /httpdocs/public ใน Plesk" : undefined },
    { ok: Boolean(cfg.publisherId), label: "ใส่ Publisher ID แล้ว", note: "ได้จาก AdSense → บัญชี → ข้อมูลบัญชี" },
    { ok: Boolean(cfg.publisherId), label: "ads.txt พร้อม (สร้างอัตโนมัติ)", note: <a href="/ads.txt" target="_blank" rel="noopener">/ads.txt</a> },
    { ok: Boolean(cfg.publisherId), label: "meta ยืนยันเว็บ google-adsense-account (ใส่อัตโนมัติ)" },
    { ok: true, label: "นโยบายความเป็นส่วนตัวเปิดเผยคุกกี้โฆษณาของ Google (แสดงเองเมื่อเปิดโฆษณา)", note: <Link href="/terms#privacy">ดู</Link> },
    { ok: true, label: "หน้าเกี่ยวกับเรา / ติดต่อเรา / เงื่อนไขการใช้งาน", note: <Link href="/about">/about</Link> },
    { ok: true, label: "แบนเนอร์ขอความยินยอมคุกกี้ (ไม่ยินยอม = โฆษณาแบบไม่ปรับตามบุคคล)" },
    { ok: true, label: "ไม่แสดงโฆษณาในหน้าเข้าสู่ระบบ ชำระเงิน ฟอร์ม และหลังบ้าน" },
    { ok: true, label: "จองพื้นที่โฆษณาไว้ก่อน (หน้าไม่กระตุก) และมีป้าย “โฆษณา” ทุกตำแหน่ง" },
    { ok: true, label: "อนุญาต crawler ของ AdSense (Mediapartners-Google) ใน robots.txt" },
  ];

  const chk = (name: string, on: boolean) => <input type="checkbox" name={name} value="1" defaultChecked={on} />;

  return (
    <>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <AdminCard title="โฆษณา Google AdSense" actions={<span className={cfg.enabled ? "font-bold text-green-800" : "text-wiki-muted"}>{cfg.enabled ? "● เปิดอยู่" : "○ ปิดอยู่"}</span>}>
        <h2 className="mb-2 font-bold">ความพร้อมตามนโยบาย AdSense</h2>
        <ul className="mb-2 space-y-1 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-2">
              <span className={c.ok === null ? "text-wiki-muted" : c.ok ? "text-green-700" : "text-red-700"}>{c.ok === null ? "–" : c.ok ? "✔" : "✖"}</span>
              <span>
                {c.label}
                {c.note && <span className="text-wiki-muted"> · {c.note}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-wiki-muted">
          ขั้นตอน: สมัคร <a href="https://adsense.google.com" target="_blank" rel="noopener">adsense.google.com</a> → เพิ่มเว็บ thaidatacorp.com → ใส่ Publisher ID ด้านล่างแล้วบันทึก
          (ยังไม่ต้องเปิดโฆษณา — meta และ ads.txt จะพร้อมให้ Google ตรวจเว็บ) → เมื่อผ่านการอนุมัติ สร้าง ad unit แล้วใส่รหัส จากนั้นเปิดโฆษณา
        </p>
      </AdminCard>

      <AdminCard title="ตั้งค่า">
        <form action={saveAdsConfig} className="space-y-4 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              Publisher ID
              <input name="publisherId" defaultValue={cfg.publisherId} placeholder="ca-pub-0000000000000000" className={`${inputCls} font-mono`} />
            </label>
            <div className="flex flex-col justify-end gap-1.5">
              <label className="flex items-center gap-2 font-bold">
                {chk("enabled", cfg.enabled)} เปิดแสดงโฆษณา
              </label>
              <label className="flex items-center gap-2">
                {chk("autoAds", cfg.autoAds)} Auto ads (โหลดสคริปต์ทุกหน้าที่อนุญาต ให้ AdSense เลือกตำแหน่งเอง — ตั้งรูปแบบได้ในเว็บ AdSense)
              </label>
              <label className="flex items-center gap-2">
                {chk("hideForPaid", cfg.hideForPaid)} ไม่แสดงโฆษณาให้สมาชิกแพ็กเกจเสียเงิน/ทดลองใช้
              </label>
            </div>
          </div>

          <fieldset className="border border-wiki-border-light p-3">
            <legend className="px-1 font-bold">ตำแหน่งโฆษณาที่กำหนดเอง (ad unit)</legend>
            <p className="mb-2 text-xs text-wiki-muted">
              สร้างใน AdSense → โฆษณา → ตามหน่วยโฆษณา → โฆษณาแบบดิสเพลย์ (ขนาดปรับตามจอ) แล้วนำตัวเลข data-ad-slot มาใส่ · เว้นว่าง = ไม่ใช้ตำแหน่งนั้น
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(AD_PLACEMENTS) as AdPlacement[]).map((k) => (
                <label key={k} className="flex flex-col gap-1">
                  {AD_PLACEMENTS[k].label}
                  <input name={`slot_${k}`} defaultValue={cfg.slots[k]} inputMode="numeric" placeholder="เช่น 1234567890" className={`${inputCls} font-mono`} />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="border border-wiki-border-light p-3">
            <legend className="px-1 font-bold">หน้าที่แสดงโฆษณา</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(Object.keys(AD_PAGE_TYPES) as AdPageType[]).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  {chk(`page_${k}`, cfg.pages[k])} {AD_PAGE_TYPES[k]}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-wiki-muted">
              ไม่แสดงเสมอ (ตามนโยบาย AdSense): <span className="font-mono">{ALWAYS_EXCLUDED.join(" ")}</span>
            </p>
            <label className="mt-2 flex flex-col gap-1">
              ไม่แสดงในหน้าเพิ่มเติม (path ขึ้นต้นด้วย คั่นด้วยเว้นวรรค)
              <input name="extraExcluded" defaultValue={cfg.extraExcluded.join(" ")} placeholder="เช่น /jobs /news" className={`${inputCls} font-mono`} />
            </label>
          </fieldset>

          <label className="flex flex-col gap-1">
            บรรทัดเพิ่มเติมใน ads.txt (ถ้าใช้เครือข่ายโฆษณาอื่น — บรรทัดของ Google ใส่ให้อัตโนมัติ)
            <textarea name="adsTxtExtra" defaultValue={cfg.adsTxtExtra} rows={2} className={`${inputCls} font-mono text-xs`} />
          </label>

          <button type="submit" className={primaryButtonCls}>
            บันทึก
          </button>
        </form>
      </AdminCard>

      <section id="report">
        <AdminCard
          title="รายงานรายได้"
          actions={
            connected && (
              <>
                {[7, 30, 90, 365].map((d) => (
                  <Link key={d} href={`/admin/ads?days=${d}#report`} className={d === days ? "font-bold" : ""}>
                    {d === 365 ? "1 ปี" : `${d} วัน`}
                  </Link>
                ))}
              </>
            )
          }
        >
          {!connected ? (
            <div className="text-sm">
              <p className="mb-3">
                เชื่อมต่อบัญชี AdSense (สิทธิ์อ่านรายงานอย่างเดียว) แล้วระบบจะดึงรายได้ การแสดงผล และคลิกมาแสดงที่นี่ทุกวันอัตโนมัติ
              </p>
              {isGoogleConfigured() ? (
                <a href="/admin/ads/connect" className={primaryButtonCls}>
                  เชื่อมต่อบัญชี AdSense
                </a>
              ) : (
                <p className="text-red-800">ต้องตั้ง GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET ก่อน</p>
              )}
              <p className="mt-3 text-xs text-wiki-muted">
                ก่อนเชื่อมต่อครั้งแรก ใน Google Cloud Console (โปรเจกต์เดียวกับ Google Login): เปิด &ldquo;AdSense Management API&rdquo; และเพิ่ม Authorized redirect URI{" "}
                <span className="font-mono">{SITE_URL}/admin/ads/callback</span>
              </p>
            </div>
          ) : (
            <div className="text-sm">
              <p className="mb-3 text-xs text-wiki-muted">
                บัญชี: <b>{accountName ?? account}</b> · ดึงล่าสุด {utcToThai(syncedAt)} · อัปเดตอัตโนมัติทุกวัน 06:30 น. ·{" "}
                <form action={syncAdsenseNow} className="inline">
                  <button type="submit" className="text-wiki-link hover:underline">
                    ดึงตอนนี้
                  </button>
                </form>{" "}
                ·{" "}
                <form action={disconnectAdsense} className="inline">
                  <button type="submit" className="text-red-800 hover:underline">
                    ยกเลิกการเชื่อมต่อ
                  </button>
                </form>
              </p>
              {report && (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                    {[
                      ["รายได้ประมาณการ", baht(report.earnings)],
                      ["Page RPM (AdSense)", report.pageViews ? baht((report.earnings / report.pageViews) * 1000) : "-"],
                      ["RPM จากสถิติเว็บเรา", report.ourViews ? baht((report.earnings / report.ourViews) * 1000) : "-"],
                      ["การแสดงผล", formatNumber(report.impressions)],
                      ["คลิก (CTR)", `${formatNumber(report.clicks)}${report.impressions ? ` (${((report.clicks / report.impressions) * 100).toFixed(2)}%)` : ""}`],
                    ].map(([k, v]) => (
                      <div key={k} className="border border-wiki-border-light p-3">
                        <div className="text-xs text-wiki-muted">{k}</div>
                        <div className="font-serif text-xl tabular-nums">{v}</div>
                      </div>
                    ))}
                  </div>
                  <h3 className="mb-1 font-bold">รายได้รายวัน (บาท)</h3>
                  <ViewsLine data={report.daily.map((d) => ({ day: d.day, views: Math.round(d.earnings * 100) / 100 }))} height={140} color="#14866d" label="บาท" />
                  <div className="mt-4 grid gap-6 lg:grid-cols-2">
                    <div>
                      <h3 className="mb-1 font-bold">แยกตามหน่วยโฆษณา</h3>
                      {report.units.length === 0 ? (
                        <p className="text-wiki-muted">ยังไม่มีข้อมูล</p>
                      ) : (
                        <table className="wikitable w-full">
                          <thead>
                            <tr>
                              <th scope="col">หน่วยโฆษณา</th>
                              <th scope="col">รายได้</th>
                              <th scope="col">แสดงผล</th>
                              <th scope="col">คลิก</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.units.map((u) => (
                              <tr key={u.unit}>
                                <td>{u.unit}</td>
                                <td className="text-right tabular-nums">{baht(u.earnings)}</td>
                                <td className="text-right tabular-nums">{formatNumber(u.impressions)}</td>
                                <td className="text-right tabular-nums">{formatNumber(u.clicks)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div>
                      <h3 className="mb-1 font-bold">หน้าที่เข้าชม (สถิติเว็บเรา) ในช่วงเดียวกัน</h3>
                      <table className="wikitable w-full">
                        <tbody>
                          {report.ourByType.map((t) => (
                            <tr key={t.type}>
                              <td>{t.type}</td>
                              <td className="text-right tabular-nums">{formatNumber(t.views)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-wiki-muted">
                    ตัวเลขจาก AdSense เป็นรายได้ประมาณการ (ยอดจ่ายจริงสรุปต้นเดือนถัดไป) · ระบบดึงย้อนหลัง 35 วันทุกวันเพราะ AdSense ปรับตัวเลขย้อนหลังได้
                  </p>
                </>
              )}
            </div>
          )}
        </AdminCard>
      </section>
    </>
  );
}
