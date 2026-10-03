import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDeleteMember, adminExtend, adminRevoke, adminSetPlan } from "@/app/admin/actions";
import AdminCard from "@/components/AdminCard";
import { Notice, buttonCls, inputCls, primaryButtonCls } from "@/components/Panel";
import { getMember } from "@/lib/admin-repo";
import { agencyUrl, formatNumber } from "@/lib/format";
import { getPlans } from "@/lib/plans";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MSG: Record<string, { tone: "ok" | "error"; text: string }> = {
  "ok:plan": { tone: "ok", text: "เปลี่ยนแพ็กเกจแล้ว" },
  "ok:extended": { tone: "ok", text: "ต่ออายุแล้ว" },
  "ok:revoked": { tone: "ok", text: "บังคับออกจากระบบทุกอุปกรณ์แล้ว" },
  "error:plan": { tone: "error", text: "ไม่พบแพ็กเกจ" },
  "error:expires": { tone: "error", text: "กรุณาระบุวันหมดอายุ" },
  "error:confirm": { tone: "error", text: "พิมพ์ DELETE เพื่อยืนยันการลบ" },
  "error:self": { tone: "error", text: "ลบบัญชีของตัวเองไม่ได้" },
};

export default async function MemberPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  const [data, plans, q] = await Promise.all([Number.isInteger(id) && id > 0 ? getMember(id) : null, getPlans(), searchParams]);
  if (!data) notFound();
  const { user: u, watches, searches, orders, sessions, identities } = data;
  const msg = one(q.ok) ? MSG[`ok:${one(q.ok)}`] : one(q.error) ? MSG[`error:${one(q.error)}`] : undefined;
  const defaultExpiry = (u.plan_expires_at ? String(u.plan_expires_at) : new Date(Date.now() + 30 * 864e5).toISOString()).slice(0, 10);

  return (
    <>
      <AdminCard title={u.email} actions={<Link href="/admin/members">← สมาชิกทั้งหมด</Link>}>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <p className="mb-4 text-sm">
          แพ็กเกจ <b>{plans[u.plan]?.name ?? u.plan}</b>
          {u.plan !== "free" && (
            <>
              {" "}
              หมดอายุ {u.plan_expires_at ? String(u.plan_expires_at).slice(0, 16) : "-"}
              {Number(u.active) !== 1 && <span className="text-red-800"> (หมดอายุแล้ว)</span>}
              {Number(u.active) === 1 && Number(u.on_trial) === 1 && <span className="text-blue-800"> (ช่วงทดลองใช้ฟรี)</span>}
            </>
          )}{" "}
          · สมัคร {String(u.created_at).slice(0, 10)} · session ที่ใช้งาน {sessions.length}
          {u.trial_used_at && ` · ใช้สิทธิ์ทดลอง ${u.trial_plan} เมื่อ ${String(u.trial_used_at).slice(0, 10)}`}
          {u.display_name && ` · ชื่อ ${u.display_name}`}
          {identities.length > 0 &&
            ` · เชื่อม ${identities.map((i) => `${i.provider}${i.name ? ` (${i.name})` : ""}`).join(", ")}`}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <form action={adminSetPlan} className="flex flex-col gap-2 border border-wiki-border-light p-3 text-sm">
            <b>เปลี่ยนแพ็กเกจ</b>
            <input type="hidden" name="id" value={u.id} />
            <select name="plan" defaultValue={u.plan} className={inputCls}>
              {Object.values(plans).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.price ? `(${formatNumber(p.price)} ฿/เดือน)` : ""}
                </option>
              ))}
            </select>
            <label className="flex flex-col">
              วันหมดอายุ (ไม่ใช้กับแพ็กเกจฟรี)
              <input type="date" name="expires" defaultValue={defaultExpiry} className={inputCls} />
            </label>
            <button type="submit" className={primaryButtonCls}>
              บันทึก
            </button>
          </form>

          <div className="flex flex-col gap-3">
            <form action={adminExtend} className="flex flex-wrap items-center gap-2 border border-wiki-border-light p-3 text-sm">
              <b className="w-full">ต่ออายุแพ็กเกจปัจจุบัน</b>
              <input type="hidden" name="id" value={u.id} />
              <select name="months" defaultValue="1" className={inputCls}>
                {[1, 3, 6, 12].map((m) => (
                  <option key={m} value={m}>
                    +{m} เดือน
                  </option>
                ))}
              </select>
              <button type="submit" className={buttonCls}>
                ต่ออายุ
              </button>
            </form>
            <form action={adminRevoke} className="border border-wiki-border-light p-3 text-sm">
              <input type="hidden" name="id" value={u.id} />
              <button type="submit" className={buttonCls}>
                บังคับออกจากระบบทุกอุปกรณ์
              </button>
            </form>
            <form action={adminDeleteMember} className="flex flex-wrap items-center gap-2 border border-red-300 p-3 text-sm">
              <b className="w-full text-red-800">ลบบัญชี</b>
              <span className="w-full text-xs text-wiki-muted">
                ลบอีเมล รายการติดตาม เงื่อนไขแจ้งเตือน และคำสั่งซื้อที่ยังไม่ชำระ (คำสั่งซื้อที่ชำระแล้วเก็บไว้เป็นหลักฐานโดยไม่มีอีเมล)
              </span>
              <input type="hidden" name="id" value={u.id} />
              <input name="confirm" placeholder="พิมพ์ DELETE" className={`${inputCls} w-32`} />
              <button type="submit" className={`${buttonCls} text-red-800`}>
                ลบ
              </button>
            </form>
          </div>
        </div>
      </AdminCard>

      <AdminCard title={`รายการที่ติดตาม (${watches.length})`}>
        <ul className="list-disc pl-6 text-sm">
          {watches.map((w) => (
            <li key={`${w.kind}:${w.target}`}>
              {w.kind === "company" ? "บริษัท" : "หน่วยงาน"}:{" "}
              <Link href={w.kind === "company" ? `/company/${w.target}` : agencyUrl(w.target)}>{w.target}</Link>
            </li>
          ))}
          {watches.length === 0 && <li className="list-none text-wiki-muted">ไม่มี</li>}
        </ul>
        <p className="mt-2 text-sm">
          เงื่อนไขแจ้งเตือนบริษัทเปิดใหม่:{" "}
          {searches.length ? searches.map((s) => `${s.tsic_code ?? "ทุกประเภท"} · ${s.province ?? "ทุกจังหวัด"}`).join(", ") : "ไม่มี"}
        </p>
      </AdminCard>

      <AdminCard title={`คำสั่งซื้อ (${orders.length})`} actions={<Link href="/admin/orders">ทั้งหมด →</Link>}>
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">รหัส</th>
              <th scope="col">แพ็กเกจ</th>
              <th scope="col">ยอด</th>
              <th scope="col">สถานะ</th>
              <th scope="col">ข้อมูลการโอน</th>
              <th scope="col">สร้าง</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="font-mono">{o.ref}</td>
                <td>
                  {o.plan} × {o.months}
                </td>
                <td className="text-right tabular-nums">{formatNumber(Number(o.amount))}</td>
                <td>{o.status}</td>
                <td className="text-sm">{o.payer_note ?? "-"}</td>
                <td className="text-sm whitespace-nowrap">{String(o.created_at).slice(0, 16)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </>
  );
}
