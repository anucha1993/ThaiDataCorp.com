import Link from "next/link";
import AdminCard from "@/components/AdminCard";
import RangeSelect from "@/components/RangeSelect";
import { buttonCls, inputCls } from "@/components/Panel";
import { getIpViews, getTopIps } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

/** UTC "YYYY-MM-DD HH:MM:SS" → เวลาไทยแบบย่อ */
function th(ts: string): string {
  const d = new Date(`${ts.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? ts : new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

/** ตัวเลขที่ถือว่าผิดปกติ (น่าจะเป็นสคริปต์ดูดข้อมูล) ต่อวัน */
const SUSPICIOUS_PER_DAY = 500;

export default async function IpPage({ searchParams }: Props) {
  const q = await searchParams;
  const days = [1, 7, 30, 90].includes(Number(one(q.days))) ? Number(one(q.days)) : 1;
  const ip = one(q.ip).slice(0, 45);

  if (ip) {
    const views = await getIpViews(ip);
    return (
      <AdminCard title={`IP ${ip}`} actions={<Link href={`/admin/analytics/ip?days=${days}`}>← รายการ IP</Link>}>
        <p className="mb-3 text-sm text-wiki-muted">
          {formatNumber(views.length)} รายการล่าสุด (สูงสุด 500) · เวลาไทย ·{" "}
          <a href={`https://ipinfo.io/${encodeURIComponent(ip)}`} target="_blank" rel="noopener">
            ตรวจสอบเจ้าของ IP ↗
          </a>
        </p>
        <div className="overflow-x-auto">
          <table className="wikitable">
            <thead>
              <tr>
                <th scope="col">เวลา</th>
                <th scope="col">หน้า</th>
                <th scope="col">มาจาก</th>
                <th scope="col">อุปกรณ์</th>
              </tr>
            </thead>
            <tbody>
              {views.map((v, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap tabular-nums">{th(v.ts)}</td>
                  <td className="max-w-96 truncate">
                    <a href={v.path} target="_blank" rel="noopener">
                      {safeDecode(v.path)}
                    </a>
                  </td>
                  <td className="text-xs">{v.referrer ?? "-"}</td>
                  <td className="text-xs whitespace-nowrap">
                    {v.agent}
                    {v.member && " · สมาชิก"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    );
  }

  const rows = await getTopIps(days);
  const limit = SUSPICIOUS_PER_DAY * days;
  return (
    <AdminCard title="IP ที่เข้าชม (บันทึกความปลอดภัย)" actions={<Link href="/admin/analytics">← สถิติผู้เข้าชม</Link>}>
      <form className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        <RangeSelect
          key={days}
          name="days"
          defaultValue={String(days)}
          className={inputCls}
          options={[
            ["1", "24 ชั่วโมง"],
            ["7", "7 วัน"],
            ["30", "30 วัน"],
            ["90", "90 วัน"],
          ]}
        />
        <input name="ip" placeholder="ค้นหา IP" className={`${inputCls} w-48`} />
        <button type="submit" className={buttonCls}>
          แสดง
        </button>
      </form>
      <p className="mb-3 text-xs text-wiki-muted">
        เก็บ IP ไว้ 90 วันเพื่อความปลอดภัย แล้วลบอัตโนมัติ (งาน &ldquo;ล้างข้อมูลสถิติ / IP เก่า&rdquo;) · แถวสีแดง = เกิน {formatNumber(SUSPICIOUS_PER_DAY)}{" "}
        หน้าต่อวัน อาจเป็นสคริปต์ดูดข้อมูล · ไม่นับบอทที่ประกาศตัว (Googlebot ฯลฯ)
      </p>
      <div className="overflow-x-auto">
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">IP</th>
              <th scope="col">เข้าชม</th>
              <th scope="col">หน้าไม่ซ้ำ</th>
              <th scope="col">อุปกรณ์</th>
              <th scope="col">ครั้งแรก</th>
              <th scope="col">ล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ip} className={r.views > limit ? "bg-red-50" : undefined}>
                <td className="font-mono">
                  <Link href={`/admin/analytics/ip?days=${days}&ip=${encodeURIComponent(r.ip)}`}>{r.ip}</Link>
                  {r.member && <span className="ml-1 text-xs text-wiki-muted">(สมาชิก)</span>}
                </td>
                <td className={`text-right tabular-nums ${r.views > limit ? "font-bold text-red-800" : ""}`}>{formatNumber(r.views)}</td>
                <td className="text-right tabular-nums">{formatNumber(r.pages)}</td>
                <td className="text-xs">{r.agent}</td>
                <td className="text-xs whitespace-nowrap">{th(r.first)}</td>
                <td className="text-xs whitespace-nowrap">{th(r.last)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-wiki-muted">
                  ยังไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
