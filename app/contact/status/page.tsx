import type { Metadata } from "next";
import Link from "next/link";
import Panel, { inputCls, primaryButtonCls } from "@/components/Panel";
import { formatThaiDate } from "@/lib/format";
import { findRequestForRequester, REQUEST_STATUS, REQUEST_TYPES } from "@/lib/support";

export const metadata: Metadata = { title: "ติดตามสถานะคำร้อง", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ ticket?: string; email?: string }> };

/** ผู้แจ้งตรวจสอบสถานะ — ต้องกรอกทั้งเลขที่คำร้องและอีเมลที่ใช้ส่ง (กันคนอื่นเดาเลขดู) */
export default async function StatusPage({ searchParams }: Props) {
  const q = await searchParams;
  const ticket = q.ticket?.trim().slice(0, 20) ?? "";
  const email = q.email?.trim().slice(0, 255) ?? "";
  const r = ticket && email ? await findRequestForRequester(ticket, email) : null;
  const st = r ? REQUEST_STATUS[r.status] : null;

  return (
    <Panel title="ติดตามสถานะคำร้อง" crumbs={[{ label: "ติดต่อเรา", href: "/contact" }, { label: "ติดตามสถานะ" }]}>
      <form method="get" className="mb-6 flex max-w-2xl flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          เลขที่คำร้อง
          <input name="ticket" defaultValue={ticket} required placeholder="TDC-691003-XXXX" className={`${inputCls} font-mono`} />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          อีเมลที่ใช้ส่งคำร้อง
          <input name="email" type="email" defaultValue={email} required className={inputCls} />
        </label>
        <button type="submit" className={primaryButtonCls}>
          ตรวจสอบ
        </button>
      </form>

      {ticket && email && !r && <p className="text-red-800">ไม่พบคำร้องที่ตรงกับเลขที่และอีเมลนี้</p>}
      {r && st && (
        <table className="wikitable max-w-2xl">
          <tbody>
            <tr>
              <th scope="row" className="w-40 text-left!">เลขที่คำร้อง</th>
              <td className="font-mono">{r.ticket}</td>
            </tr>
            <tr>
              <th scope="row" className="text-left!">ประเภท</th>
              <td>{REQUEST_TYPES[r.type]?.label ?? r.type}</td>
            </tr>
            {r.juristicId && (
              <tr>
                <th scope="row" className="text-left!">นิติบุคคล</th>
                <td>
                  <Link href={`/company/${r.juristicId}`}>{r.companyName ?? r.juristicId}</Link>
                </td>
              </tr>
            )}
            <tr>
              <th scope="row" className="text-left!">สถานะ</th>
              <td>
                <span className={`border px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
              </td>
            </tr>
            <tr>
              <th scope="row" className="text-left!">ส่งเมื่อ</th>
              <td>{formatThaiDate(r.createdAt.slice(0, 10))}</td>
            </tr>
            {r.resolvedAt && (
              <tr>
                <th scope="row" className="text-left!">ปิดเรื่องเมื่อ</th>
                <td>{formatThaiDate(r.resolvedAt.slice(0, 10))}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
