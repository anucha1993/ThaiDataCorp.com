import type { Metadata } from "next";
import Link from "next/link";
import { addSearch, logout, removeSearch, unlinkFacebook, unwatchTarget } from "@/app/actions";
import { isFacebookConfigured } from "@/lib/facebook";
import { listIdentities } from "@/lib/identity";
import Panel, { buttonCls, inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { listSavedSearches, listUserOrders, listWatches } from "@/lib/account-repo";
import { requireUser } from "@/lib/auth";
import { agencyUrl, formatNumber, formatThaiDate } from "@/lib/format";
import { listProcurementProvinces } from "@/lib/procurement-repo";
import { isBillingEnabled } from "@/lib/billing";

export const metadata: Metadata = { title: "บัญชีของฉัน", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  "ok:trial": { tone: "ok", text: "เริ่มทดลองใช้ฟรีแล้ว ใช้ได้ทุกฟีเจอร์ของแพ็กเกจจนถึงวันหมดอายุ — ชำระเงินก่อนหมดช่วงทดลองเพื่อใช้งานต่อเนื่อง" },
  "ok:fb-linked": { tone: "ok", text: "เชื่อมบัญชี Facebook แล้ว — ครั้งต่อไปกดเข้าสู่ระบบด้วย Facebook ได้" },
  "ok:fb-unlinked": { tone: "ok", text: "ยกเลิกการเชื่อม Facebook แล้ว — ยังเข้าสู่ระบบด้วยอีเมลได้ตามปกติ" },
  "error:fb-conflict": { tone: "error", text: "บัญชี Facebook นี้ถูกเชื่อมกับสมาชิกอีกบัญชีหนึ่งอยู่แล้ว" },
  "error:fb-cancel": { tone: "error", text: "ยกเลิกการเชื่อม Facebook" },
  "error:fb-state": { tone: "error", text: "การเชื่อม Facebook หมดเวลา กรุณาลองใหม่" },
  "error:fb-failed": { tone: "error", text: "เชื่อมต่อ Facebook ไม่สำเร็จ กรุณาลองใหม่" },
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
  const fbIdentity = identities.find((i) => i.provider === "facebook");
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
          <div className="text-sm text-wiki-muted">{user.email}</div>
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
        <li>✉️ อีเมล: <b>{user.email}</b> (ลิงก์เข้าสู่ระบบทางอีเมล)</li>
        <li className="flex flex-wrap items-center gap-2">
          <span>
            Facebook:{" "}
            {fbIdentity ? <b>เชื่อมแล้ว{fbIdentity.name ? ` (${fbIdentity.name})` : ""}</b> : <span className="text-wiki-muted">ยังไม่ได้เชื่อม</span>}
          </span>
          {fbIdentity ? (
            <form action={unlinkFacebook}>
              <button type="submit" className="text-wiki-link hover:underline">
                ยกเลิกการเชื่อม
              </button>
            </form>
          ) : (
            isFacebookConfigured() && <a href="/auth/facebook?link=1">เชื่อมบัญชี Facebook</a>
          )}
        </li>
      </ul>

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
        แจ้งเตือนบริษัทเปิดใหม่{" "}
        <span className="text-base text-wiki-muted">
          ({searches.length}/{plan.maxSavedSearches})
        </span>
      </h2>
      <p className="mb-2 text-sm text-wiki-muted">
        รับอีเมลรายชื่อบริษัทที่จดทะเบียนใหม่ตามประเภทธุรกิจและ/หรือจังหวัดที่เลือก — ดูรหัสประเภทธุรกิจได้ที่{" "}
        <Link href="/tsic">หน้าประเภทธุรกิจ</Link>
      </p>
      {searches.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm">
          {searches.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <span>
                {s.tsicCode ? `${s.tsicName ?? ""} (${s.tsicCode})` : "ทุกประเภทธุรกิจ"} · {s.province ?? "ทุกจังหวัด"}
              </span>
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
