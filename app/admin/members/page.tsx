import Link from "next/link";
import AdminCard from "@/components/AdminCard";
import { Notice, buttonCls, inputCls } from "@/components/Panel";
import { listMembers } from "@/lib/admin-repo";
import { adminEmails } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { getPlans } from "@/lib/plans";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MembersPage({ searchParams }: Props) {
  const q = await searchParams;
  const search = one(q.q)?.trim() ?? "";
  const planFilter = one(q.plan) ?? "";
  const page = Math.max(1, Number(one(q.page) ?? 1) || 1);
  const role = ["member", "business", "admin"].includes(one(q.role) ?? "") ? one(q.role)! : "member";
  const admins = [...(await adminEmails())];
  const [{ rows, total, size }, plans] = await Promise.all([listMembers({ q: search, plan: planFilter, page, role, admins }), getPlans()]);
  const pages = Math.max(1, Math.ceil(total / size));
  const qs = (p: number) => `/admin/members?${new URLSearchParams({ role, q: search, plan: planFilter, page: String(p) })}`;
  const TABS = [
    ["member", "สมาชิกทั่วไป"],
    ["business", "บัญชีบริษัท"],
    ["admin", "ผู้ดูแลระบบ"],
  ] as const;

  return (
    <AdminCard title={`${TABS.find(([k]) => k === role)?.[1]} (${formatNumber(total)})`}>
      {one(q.ok) === "deleted" && <Notice tone="ok">ลบบัญชีแล้ว</Notice>}
      <nav className="mb-3 flex flex-wrap gap-1 text-sm">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/members?role=${k}`}
            className={`border px-3 py-1 hover:no-underline ${role === k ? "border-wiki-text bg-wiki-text text-white!" : "border-wiki-border-light bg-white"}`}
          >
            {label}
          </Link>
        ))}
        {role === "admin" && (
          <span className="ml-2 self-center text-xs text-wiki-muted">
            ผู้ดูแล = อีเมลใน ADMIN_EMAILS (env) + &ldquo;ผู้ดูแลเพิ่มเติม&rdquo; ใน <Link href="/admin/settings">ตั้งค่า</Link>
          </span>
        )}
      </nav>
      <form className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="role" value={role} />
        <input name="q" defaultValue={search} placeholder="ค้นหาอีเมล" className={`${inputCls} w-64`} />
        <select name="plan" defaultValue={planFilter} className={inputCls}>
          <option value="">ทุกแพ็กเกจ</option>
          <option value="paying">เสียเงิน (ใช้งานอยู่)</option>
          <option value="expired">หมดอายุ</option>
          <option value="suspended">ถูกระงับ</option>
          {Object.values(plans).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonCls}>
          ค้นหา
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">อีเมล</th>
              <th scope="col">บทบาท</th>
              <th scope="col">แพ็กเกจ</th>
              <th scope="col">หมดอายุ</th>
              <th scope="col">ติดตาม</th>
              <th scope="col">เงื่อนไข</th>
              <th scope="col">ชำระแล้ว (฿)</th>
              <th scope="col">เข้าสู่ระบบล่าสุด</th>
              <th scope="col">สมัครเมื่อ</th>
              <th scope="col">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const expired = u.plan !== "free" && Number(u.active) !== 1;
              return (
                <tr key={u.id} className={u.suspended_at ? "bg-red-50" : undefined}>
                  <td>
                    <Link href={`/admin/members/${u.id}`}>{u.email}</Link>
                    {u.suspended_at && (
                      <span className="ml-1 border border-red-700 px-1 text-xs text-red-800" title={u.suspended_reason ?? ""}>
                        ระงับ
                      </span>
                    )}
                  </td>
                  <td className="text-xs whitespace-nowrap">
                    {role === "admin" ? (
                      <span className="border border-purple-700 px-1 text-purple-800">ผู้ดูแลระบบ</span>
                    ) : Number(u.companies) > 0 ? (
                      <span className="border border-green-700 px-1 text-green-800">บริษัท ({u.companies})</span>
                    ) : (
                      <span className="text-wiki-muted">สมาชิก</span>
                    )}
                  </td>
                  <td>
                    {plans[u.plan]?.name ?? u.plan}
                    {expired && <span className="ml-1 text-xs text-red-800">(หมดอายุ)</span>}
                    {!expired && Number(u.on_trial) === 1 && <span className="ml-1 text-xs text-blue-800">(ทดลอง)</span>}
                  </td>
                  <td className="text-sm whitespace-nowrap">{u.plan_expires_at ? String(u.plan_expires_at).slice(0, 10) : "-"}</td>
                  <td className="text-right tabular-nums">{u.watches}</td>
                  <td className="text-right tabular-nums">{u.searches}</td>
                  <td className="text-right tabular-nums">{formatNumber(Number(u.paid_total))}</td>
                  <td className="text-sm whitespace-nowrap">{u.last_login ? String(u.last_login).slice(0, 16) : "-"}</td>
                  <td className="text-sm whitespace-nowrap">{String(u.created_at).slice(0, 10)}</td>
                  <td className="text-sm whitespace-nowrap">
                    <Link href={`/admin/members/${u.id}`}>{role === "admin" ? "ดูรายละเอียด" : "จัดการ / ระงับ / ลบ"}</Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-sm text-wiki-muted">
                  ไม่พบสมาชิก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="mt-3 flex gap-3 text-sm">
          {page > 1 && <Link href={qs(page - 1)}>← ก่อนหน้า</Link>}
          <span className="text-wiki-muted">
            หน้า {page}/{pages}
          </span>
          {page < pages && <Link href={qs(page + 1)}>ถัดไป →</Link>}
        </nav>
      )}
    </AdminCard>
  );
}
