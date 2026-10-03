import type { Metadata } from "next";
import Link from "next/link";
import { addSearch, changePassword, logout, removeSearch, unlinkGoogle, unwatchTarget } from "@/app/actions";
import { isGoogleConfigured } from "@/lib/google";
import { listIdentities } from "@/lib/identity";
import Panel, { buttonCls, inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { listSavedSearches, listUserOrders, listWatches } from "@/lib/account-repo";
import { requireUser } from "@/lib/auth";
import { agencyUrl, formatNumber, formatThaiDate } from "@/lib/format";
import { PASSWORD_MIN } from "@/lib/password";
import { listProcurementProvinces } from "@/lib/procurement-repo";
import { isBillingEnabled } from "@/lib/billing";

export const metadata: Metadata = { title: "บัญชีของฉัน", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  "ok:trial": { tone: "ok", text: "เริ่มทดลองใช้ฟรีแล้ว ใช้ได้ทุกฟีเจอร์ของแพ็กเกจจนถึงวันหมดอายุ — ชำระเงินก่อนหมดช่วงทดลองเพื่อใช้งานต่อเนื่อง" },
  "ok:g-linked": { tone: "ok", text: "เชื่อมบัญชี Google แล้ว — ครั้งต่อไปกดเข้าสู่ระบบด้วย Google ได้" },
  "ok:g-unlinked": { tone: "ok", text: "ยกเลิกการเชื่อม Google แล้ว — ยังเข้าสู่ระบบด้วยอีเมลและรหัสผ่านได้ตามปกติ" },
  "error:g-unlink-nopw": { tone: "error", text: "กรุณาตั้งรหัสผ่านก่อนยกเลิกการเชื่อม Google ไม่เช่นนั้นจะเข้าสู่ระบบไม่ได้" },
  "ok:password": { tone: "ok", text: "บันทึกรหัสผ่านแล้ว" },
  "error:pw-short": { tone: "error", text: `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN} ตัวอักษร` },
  "error:pw-long": { tone: "error", text: "รหัสผ่านยาวเกินไป" },
  "error:pw-mismatch": { tone: "error", text: "ยืนยันรหัสผ่านไม่ตรงกัน" },
  "error:pw-current": { tone: "error", text: "รหัสผ่านปัจจุบันไม่ถูกต้อง" },
  "error:g-conflict": { tone: "error", text: "บัญชี Google นี้ถูกเชื่อมกับสมาชิกอีกบัญชีหนึ่งอยู่แล้ว" },
  "error:g-cancel": { tone: "error", text: "ยกเลิกการเชื่อม Google" },
  "error:g-state": { tone: "error", text: "การเชื่อม Google หมดเวลา กรุณาลองใหม่" },
  "error:g-failed": { tone: "error", text: "เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่" },
  "ok:watch": { tone: "ok", text: "เพิ่มรายการติดตามแล้ว ระบบจะแจ้งเตือนทางอีเมลเมื่อมีสัญญาภาครัฐใหม่" },
  "ok:search": { tone: "ok", text: "เพิ่มเงื่อนไขแจ้งเตือนบริษัทเปิดใหม่แล้ว" },
  "error:watch": { tone: "error", text: "ไม่สามารถเพิ่มรายการติดตามได้" },
  "error:watch-limit": { tone: "error", text: "ติดตามครบจำนวนสูงสุดของแพ็กเกจแล้ว — อัปเกรดเพื่อติดตามเพิ่ม" },
  "error:search-limit": { tone: "error", text: "เงื่อนไขแจ้งเตือนครบจำนวนสูงสุดของแพ็กเกจแล้ว" },
  "error:search-invalid": { tone: "error", text: "กรุณาระบุรหัสประเภทธุรกิจ 5 หลักที่ถูกต้อง หรือเลือกจังหวัด" },
};

const STATUS: Record<string, string> = {
  pending: "รอชำระเงิน",
  submitted: "แจ้งโอนแล้ว รอตรวจสอบ",
  paid: "ชำระแล้ว",
  cancelled: "ยกเลิก",
};

export default async function AccountPage({ searchParams }: Props) {
  const user = await requireUser("/account");
  const q = await searchParams;
  const msgKey = one(q.ok) ? `ok:${one(q.ok)}` : one(q.error) ? `error:${one(q.error)}` : "";
  let msg = MESSAGES[msgKey];
  const [watches, searches, orders, provinces, identities] = await Promise.all([
    listWatches(user.id),
    listSavedSearches(user.id),
    listUserOrders(user.id),
    listProcurementProvinces(),
    listIdentities(user.id),
  ]);
  const googleIdentity = identities.find((i) => i.provider === "google");
  const plan = user.plan;
  const billing = await isBillingEnabled();
  if (!billing && msgKey === "error:watch-limit") {
    msg = { tone: "error", text: "ติดตามครบจำนวนสูงสุดแล้ว — เลิกติดตามรายการเดิมเพื่อเพิ่มรายการใหม่" };
  }

  return (
    <Panel title="บัญชีของฉัน" crumbs={[{ label: "บัญชีของฉัน" }]}>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <section className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <div className="text-sm text-wiki-muted">
            {user.displayName && <b className="text-wiki-text">{user.displayName} · </b>}
            {user.email}
          </div>
          <div className="text-lg">
            {billing ? (
              <>
                แพ็กเกจ: <b>{plan.name}</b>
              </>
            ) : (
              <>
                สถานะ: <b>สมาชิก</b> <span className="text-sm text-wiki-muted">— ช่วงเปิดตัว ใช้งานได้ทุกฟีเจอร์ฟรี</span>
              </>
            )}
            {user.onTrial && <span className="ml-1 border border-blue-700 px-1.5 text-xs text-blue-800">ทดลองใช้ฟรี</span>}
            {billing && plan.id !== "free" && user.planExpiresAt && (
              <span className="text-sm text-wiki-muted"> (ใช้ได้ถึง {formatThaiDate(user.planExpiresAt.slice(0, 10))})</span>
            )}
          </div>
        </div>
        {billing && (
          <Link href="/pricing" className={primaryButtonCls}>
            {user.onTrial ? "ชำระเงินเพื่อใช้ต่อ" : plan.id === "free" ? "อัปเกรด" : "ต่ออายุ / เปลี่ยนแพ็กเกจ"}
          </Link>
        )}
        <form action={logout}>
          <button type="submit" className={buttonCls}>
            ออกจากระบบ
          </button>
        </form>
      </section>

      <h2 id="login-methods" className="wiki-h2">
        วิธีเข้าสู่ระบบ
      </h2>
      <ul className="mb-2 space-y-2 text-sm">
        <li>
          ✉️ อีเมล: <b>{user.email}</b>{" "}
          {user.hasPassword ? "(ตั้งรหัสผ่านแล้ว)" : <span className="text-wiki-muted">(ยังไม่ได้ตั้งรหัสผ่าน)</span>}
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span>
            Google:{" "}
            {googleIdentity ? <b>เชื่อมแล้ว{googleIdentity.email ? ` (${googleIdentity.email})` : ""}</b> : <span className="text-wiki-muted">ยังไม่ได้เชื่อม</span>}
          </span>
          {googleIdentity ? (
            <form action={unlinkGoogle}>
              <button type="submit" className="text-wiki-link hover:underline">
                ยกเลิกการเชื่อม
              </button>
            </form>
          ) : (
            isGoogleConfigured() && <a href="/auth/google?link=1">เชื่อมบัญชี Google</a>
          )}
        </li>
      </ul>
      <details className="mb-2 max-w-md text-sm" open={!user.hasPassword && !googleIdentity}>
        <summary className="cursor-pointer text-wiki-link">{user.hasPassword ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน (เข้าสู่ระบบด้วยอีเมลได้)"}</summary>
        <form action={changePassword} className="mt-2 flex flex-col gap-2">
          <input type="email" name="username" value={user.email} autoComplete="username" readOnly hidden />
          {user.hasPassword && (
            <input name="current" type="password" required placeholder="รหัสผ่านปัจจุบัน" autoComplete="current-password" className={inputCls} />
          )}
          <input name="password" type="password" required minLength={PASSWORD_MIN} placeholder={`รหัสผ่านใหม่ (อย่างน้อย ${PASSWORD_MIN} ตัวอักษร)`} autoComplete="new-password" className={inputCls} />
          <input name="password2" type="password" required minLength={PASSWORD_MIN} placeholder="ยืนยันรหัสผ่านใหม่" autoComplete="new-password" className={inputCls} />
          <button type="submit" className={buttonCls}>
            บันทึกรหัสผ่าน
          </button>
        </form>
      </details>

      <h2 id="watches" className="wiki-h2">
        รายการที่ติดตาม{" "}
        <span className="text-base text-wiki-muted">
          ({watches.length}/{plan.maxWatches})
        </span>
      </h2>
      <p className="mb-2 text-sm text-wiki-muted">
        แจ้งเตือนทางอีเมลเมื่อบริษัทหรือหน่วยงานที่ติดตามมีสัญญาจัดซื้อจัดจ้างภาครัฐใหม่ (ทุก {plan.alertEveryDays === 1 ? "วัน" : `${plan.alertEveryDays} วัน`})
        — กดปุ่ม &ldquo;ติดตาม&rdquo; ในหน้าบริษัทหรือหน้าหน่วยงานเพื่อเพิ่ม
      </p>
      {watches.length === 0 ? (
        <p className="text-sm italic text-wiki-muted">
          ยังไม่มีรายการ ลองดู <Link href="/procurement">บริษัทที่ได้งานภาครัฐมากที่สุด</Link> หรือ{" "}
          <Link href="/agency">หน่วยงานรัฐ</Link>
        </p>
      ) : (
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">ประเภท</th>
              <th scope="col">รายการ</th>
              <th scope="col">เริ่มติดตาม</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {watches.map((w) => (
              <tr key={`${w.kind}:${w.target}`}>
                <td>{w.kind === "company" ? "บริษัท" : "หน่วยงาน"}</td>
                <td>
                  <Link href={w.kind === "company" ? `/company/${w.target}` : agencyUrl(w.target)}>{w.label}</Link>
                </td>
                <td className="whitespace-nowrap">{formatThaiDate(w.createdAt.slice(0, 10))}</td>
                <td>
                  <form action={unwatchTarget}>
                    <input type="hidden" name="kind" value={w.kind} />
                    <input type="hidden" name="target" value={w.target} />
                    <button type="submit" className="text-sm text-wiki-link hover:underline">
                      เลิกติดตาม
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 id="searches" className="wiki-h2">
        แจ้งเตือนรายชื่อใหม่ (การค้นหาที่บันทึก){" "}
        <span className="text-base text-wiki-muted">
          ({searches.length}/{plan.maxSavedSearches})
        </span>
      </h2>
      <p className="mb-2 text-sm text-wiki-muted">
        รับอีเมลรายชื่อนิติบุคคลที่จดทะเบียนใหม่ตามเงื่อนไข — ตั้งเงื่อนไขละเอียด (ทุน จด VAT เคยได้งานรัฐ ฯลฯ) ได้ที่{" "}
        <Link href="/search">ค้นหาขั้นสูง</Link> แล้วกด &ldquo;บันทึกการค้นหานี้&rdquo; หรือเพิ่มแบบง่ายด้านล่าง
      </p>
      {searches.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm">
          {searches.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              {s.query ? (
                <span>
                  {s.label ?? s.query} · <Link href={`/search?${s.query}`}>ดูผล</Link> ·{" "}
                  <a href={`/export/search?${s.query}`} rel="nofollow">
                    CSV
                  </a>
                </span>
              ) : (
                <span>
                  {s.tsicCode ? `${s.tsicName ?? ""} (${s.tsicCode})` : "ทุกประเภทธุรกิจ"} · {s.province ?? "ทุกจังหวัด"}
                </span>
              )}
              <form action={removeSearch}>
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" className="text-wiki-link hover:underline">
                  ลบ
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={addSearch} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col">
          รหัสประเภทธุรกิจ (5 หลัก)
          <input name="tsic" inputMode="numeric" pattern="\d{5}" placeholder="เช่น 41002" className={`${inputCls} w-40`} />
        </label>
        <label className="flex flex-col">
          จังหวัด
          <select name="province" defaultValue="" className={inputCls}>
            <option value="">ทุกจังหวัด</option>
            {provinces
              .map((p) => p.province)
              .sort((a, b) => a.localeCompare(b, "th"))
              .map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
          </select>
        </label>
        <button type="submit" className={buttonCls}>
          เพิ่มเงื่อนไข
        </button>
      </form>

      <h2 className="wiki-h2">ดาวน์โหลดข้อมูล (CSV)</h2>
      {plan.exportRows > 0 ? (
        <ul className="list-disc space-y-1 pl-6 text-sm">
          <li>
            รายชื่อบริษัทเปิดใหม่: เปิดหน้า <Link href="/new">บริษัทเปิดใหม่</Link> เลือกเดือน/จังหวัด/ประเภทธุรกิจ แล้วกด
            &ldquo;ดาวน์โหลด CSV&rdquo; (สูงสุด {formatNumber(plan.exportRows)} แถว/ไฟล์)
          </li>
          {plan.exportContracts && (
            <li>สัญญาภาครัฐ: กด &ldquo;ดาวน์โหลด CSV&rdquo; ในส่วนงานจัดซื้อจัดจ้างของหน้าบริษัท หรือในหน้าหน่วยงาน</li>
          )}
        </ul>
      ) : (
        <p className="text-sm">
          การดาวน์โหลด CSV ไม่รวมในสิทธิ์ปัจจุบัน — <Link href="/pricing">ดูรายละเอียด</Link>
        </p>
      )}

      {billing && orders.length > 0 && (
        <>
          <h2 className="wiki-h2">ประวัติคำสั่งซื้อ</h2>
          <table className="wikitable">
            <thead>
              <tr>
                <th scope="col">รหัส</th>
                <th scope="col">แพ็กเกจ</th>
                <th scope="col">ยอด (บาท)</th>
                <th scope="col">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.ref}>
                  <td className="font-mono">
                    {o.status === "paid" || o.status === "cancelled" ? o.ref : <Link href={`/pay/${o.ref}`}>{o.ref}</Link>}
                  </td>
                  <td>
                    {o.plan} × {o.months} เดือน
                  </td>
                  <td className="text-right tabular-nums">{formatNumber(o.amount)}</td>
                  <td>{STATUS[o.status] ?? o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {user.isAdmin && (
        <p className="mt-6 text-sm">
          <Link href="/admin">→ ระบบหลังบ้าน (ผู้ดูแล)</Link>
        </p>
      )}
    </Panel>
  );
}
