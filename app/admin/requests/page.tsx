import Link from "next/link";
import AdminCard from "@/components/AdminCard";
import { buttonCls, inputCls } from "@/components/Panel";
import { formatNumber } from "@/lib/format";
import { listRequests, REQUEST_STATUS, REQUEST_TYPES } from "@/lib/support";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function RequestsPage({ searchParams }: Props) {
  const q = await searchParams;
  // ค่าเริ่มต้น: เรื่องใหม่ (ยังไม่ได้เปิดดำเนินการ)
  const status = "status" in q ? one(q.status) : "new";
  const f = { status, type: one(q.type), q: one(q.q) };
  const page = Math.max(1, Number(one(q.page)) || 1);
  const { rows, total } = await listRequests(f, page);
  const pages = Math.max(1, Math.ceil(total / 50));
  const qs = (p: number) => `/admin/requests?${new URLSearchParams({ status, type: f.type, q: f.q, page: String(p) })}`;

  return (
    <AdminCard title={`คำร้อง (${formatNumber(total)})`}>
      <form className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        <select name="status" defaultValue={status} className={inputCls}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(REQUEST_STATUS).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={f.type} className={inputCls}>
          <option value="">ทุกประเภท</option>
          {Object.entries(REQUEST_TYPES).map(([k, t]) => (
            <option key={k} value={k}>
              {t.label}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={f.q} placeholder="เลขที่ / อีเมล / ชื่อ / เลขนิติบุคคล / ข้อความ" className={`${inputCls} w-72`} />
        <button type="submit" className={buttonCls}>
          ค้นหา
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">เลขที่</th>
              <th scope="col">ประเภท</th>
              <th scope="col">สถานะ</th>
              <th scope="col">นิติบุคคล</th>
              <th scope="col">ผู้แจ้ง</th>
              <th scope="col">หัวข้อ / ข้อความ</th>
              <th scope="col">ส่งเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-mono whitespace-nowrap">
                  <Link href={`/admin/requests/${r.id}`}>{r.ticket}</Link>
                </td>
                <td className="text-xs">{REQUEST_TYPES[r.type]?.label ?? r.type}</td>
                <td>
                  <span className={`border px-1.5 text-xs whitespace-nowrap ${REQUEST_STATUS[r.status]?.cls ?? ""}`}>
                    {REQUEST_STATUS[r.status]?.label ?? r.status}
                  </span>
                </td>
                <td className="text-xs">{r.juristicId ? <Link href={`/company/${r.juristicId}`}>{r.companyName ?? r.juristicId}</Link> : "-"}</td>
                <td className="text-xs">
                  {r.name}
                  <br />
                  <span className="text-wiki-muted">{r.email}</span>
                </td>
                <td className="max-w-80 truncate text-xs">{r.subject || r.message}</td>
                <td className="text-xs whitespace-nowrap">{r.createdAt.slice(0, 16)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-wiki-muted">
                  ไม่มีคำร้อง
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <p className="mt-3 flex gap-3 text-sm">
          {page > 1 && <Link href={qs(page - 1)}>← ก่อนหน้า</Link>}
          <span className="text-wiki-muted">
            หน้า {page} / {pages}
          </span>
          {page < pages && <Link href={qs(page + 1)}>ถัดไป →</Link>}
        </p>
      )}
    </AdminCard>
  );
}
