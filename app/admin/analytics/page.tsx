import Link from "next/link";
import AdminCard from "@/components/AdminCard";
import { ShareBar } from "@/components/HomeCharts";
import { buttonCls, inputCls } from "@/components/Panel";
import { ViewsLine } from "@/components/ViewsChart";
import { getConsentStats, getOverview, getRealtime, type AnalyticsFilter } from "@/lib/analytics";
import { agencyUrl, formatNumber, tsicUrl } from "@/lib/format";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const thToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const minusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86400_000).toISOString().slice(0, 10);

const TYPE_LABEL: Record<string, string> = {
  company: "บริษัท",
  agency: "หน่วยงาน",
  tsic: "ประเภทธุรกิจ",
  new: "บริษัทเปิดใหม่ (เดือน)",
  procurement: "ผู้รับงานภาครัฐ (จังหวัด)",
  search: "หน้าค้นหา",
};

export default async function AnalyticsPage({ searchParams }: Props) {
  const q = await searchParams;
  const today = thToday();
  const range = one(q.range) || "30";
  const to = range === "custom" && isDate(one(q.to)) ? one(q.to) : today;
  const from = range === "custom" && isDate(one(q.from)) ? one(q.from) : minusDays(today, Number(range) - 1 || 29);
  const f: AnalyticsFilter = {
    from: from <= to ? from : to,
    to,
    type: TYPE_LABEL[one(q.type)] ? one(q.type) : undefined,
    id: one(q.id) || undefined,
    path: one(q.path).startsWith("/") ? one(q.path) : undefined,
  };
  const [o, rt, cs] = await Promise.all([getOverview(f), getRealtime(), getConsentStats(f)]);
  const base = { range, from: f.from, to: f.to };
  const drill = (extra: Record<string, string>) => `/admin/analytics?${new URLSearchParams({ ...base, ...extra })}`;
  const scoped = Boolean(f.type || f.path);
  const pagesPerVisitor = o.visitors ? o.views / o.visitors : 0;
  const maxHour = Math.max(1, ...o.hourly.map((h) => h.n));

  return (
    <>
      <AdminCard title="สถิติผู้เข้าชม">
        <form className="mb-3 flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            ช่วงเวลา
            <select name="range" defaultValue={range} className={inputCls}>
              <option value="1">วันนี้</option>
              <option value="7">7 วัน</option>
              <option value="30">30 วัน</option>
              <option value="90">90 วัน</option>
              <option value="365">1 ปี</option>
              <option value="custom">กำหนดเอง</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            ตั้งแต่
            <input type="date" name="from" defaultValue={f.from} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            ถึง
            <input type="date" name="to" defaultValue={f.to} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            เจาะจงหน้า (path ขึ้นต้นด้วย)
            <input name="path" defaultValue={f.path ?? ""} placeholder="/company/ หรือ /agency/" className={`${inputCls} w-56`} />
          </label>
          {f.type && <input type="hidden" name="type" value={f.type} />}
          {f.id && <input type="hidden" name="id" value={f.id} />}
          <button type="submit" className={buttonCls}>
            แสดง
          </button>
          {scoped && <Link href={`/admin/analytics?${new URLSearchParams(base)}`}>× ดูทั้งเว็บ</Link>}
        </form>

        {scoped && (
          <p className="mb-3 border-l-4 border-wiki-text bg-wiki-bg px-3 py-2 text-sm">
            กำลังดูเฉพาะ: {f.type && `${TYPE_LABEL[f.type]} `}
            {f.id && <b>{f.type === "company" ? o.companies[0]?.name ?? f.id : f.id}</b>}
            {f.path && <code>{f.path}*</code>}{" "}
            {f.type === "company" && f.id && <Link href={`/company/${f.id}`}>เปิดหน้า →</Link>}
            {f.type === "agency" && f.id && <Link href={agencyUrl(f.id)}>เปิดหน้า →</Link>}
          </p>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["การเข้าชม (หน้า)", formatNumber(o.views)],
            ["ผู้เข้าชมไม่ซ้ำ", formatNumber(o.visitors)],
            ["หน้า / ผู้เข้าชม", pagesPerVisitor.toFixed(2)],
            ["เข้าชมโดยสมาชิก", `${o.views ? ((o.memberViews / o.views) * 100).toFixed(1) : 0}%`],
            ["ออนไลน์ตอนนี้ (30 นาที)", formatNumber(rt.visitors)],
          ].map(([k, v]) => (
            <div key={k} className="border border-wiki-border-light p-3">
              <div className="text-xs text-wiki-muted">{k}</div>
              <div className="font-serif text-2xl tabular-nums">{v}</div>
            </div>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["ผู้เข้าชมไม่ซ้ำทั้งช่วง (คุกกี้)", formatNumber(cs.visitors)],
            ["ผู้เข้าชมใหม่", formatNumber(cs.newVisitors)],
            ["กลับมาเข้าชมซ้ำ", `${formatNumber(cs.returning)}${cs.visitors ? ` (${((cs.returning / cs.visitors) * 100).toFixed(0)}%)` : ""}`],
            ["อัตรายอมรับคุกกี้สถิติ", `${(cs.consentRate * 100).toFixed(1)}%`],
          ].map(([k, v]) => (
            <div key={k} className="border border-wiki-border-light bg-wiki-bg p-3">
              <div className="text-xs text-wiki-muted">{k}</div>
              <div className="font-serif text-2xl tabular-nums">{v}</div>
            </div>
          ))}
        </div>
        <p className="-mt-2 mb-4 text-xs text-wiki-muted">
          แถวนี้นับเฉพาะผู้ที่กด &ldquo;ยอมรับคุกกี้&rdquo; ({(cs.consentRate * 100).toFixed(1)}% ของการเข้าชม) — ตัวเลขจริงจึงมากกว่านี้ ·{" "}
          <Link href="/admin/analytics/ip">ดูรายการ IP →</Link>
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-bold">การเข้าชมรายวัน</h3>
            <ViewsLine data={o.daily.map((d) => ({ day: d.day, views: d.views }))} height={140} />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-bold">ผู้เข้าชมไม่ซ้ำรายวัน</h3>
            <ViewsLine data={o.daily.map((d) => ({ day: d.day, views: d.visitors }))} height={140} color="#14866d" label="คน" />
          </div>
        </div>
        <p className="mt-1 text-xs text-wiki-muted">
          กราฟผู้เข้าชมไม่ซ้ำนับรายวันจากทุกคน (ไม่ต้องใช้คุกกี้) — ยอด &ldquo;ผู้เข้าชมไม่ซ้ำ&rdquo; ด้านบนจึงนับคนเดิมซ้ำได้ถ้าเข้าคนละวัน · ไม่นับบอท/crawler · เวลาไทย
        </p>
      </AdminCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard title="หน้ายอดนิยม">
          <RankTable
            head={["หน้า", "เข้าชม", "คน"]}
            rows={o.pages.map((p) => [
              <span key="p" className="flex gap-2">
                <Link href={drill({ path: p.path })} className="truncate" title={p.path}>
                  {decodeSafe(p.path)}
                </Link>
                <a href={p.path} target="_blank" rel="noopener" className="shrink-0 text-xs">
                  ↗
                </a>
              </span>,
              formatNumber(p.views),
              formatNumber(p.visitors),
            ])}
          />
        </AdminCard>

        <AdminCard title="บริษัทที่ถูกดูมากที่สุด">
          <RankTable
            head={["บริษัท", "เข้าชม", "คน"]}
            rows={o.companies.map((c) => [
              <Link key="c" href={drill({ type: "company", id: c.id })} className="truncate">
                {c.name ?? c.id}
              </Link>,
              formatNumber(c.views),
              formatNumber(c.visitors),
            ])}
          />
        </AdminCard>

        <AdminCard title="คำที่ค้นหามากที่สุด">
          <RankTable
            head={["คำค้นหา", "ครั้ง"]}
            rows={o.searches.map((s) => [
              <a key="s" href={`/search?q=${encodeURIComponent(s.query)}`} target="_blank" rel="noopener">
                {s.query}
              </a>,
              formatNumber(s.n),
            ])}
          />
        </AdminCard>

        <AdminCard title="แหล่งที่มา (Referrer)">
          <RankTable head={["เว็บต้นทาง", "เข้าชม", "คน"]} rows={o.referrers.map((r) => [r.ref, formatNumber(r.n), formatNumber(r.visitors)])} />
        </AdminCard>

        <AdminCard title="หน่วยงานที่ถูกดูมากที่สุด">
          <RankTable
            head={["หน่วยงาน", "เข้าชม"]}
            rows={o.agencies.map((a) => [
              <Link key="a" href={drill({ type: "agency", id: a.id })}>
                {a.id}
              </Link>,
              formatNumber(a.views),
            ])}
          />
        </AdminCard>

        <AdminCard title="ประเภทธุรกิจที่ถูกดูมากที่สุด">
          <RankTable
            head={["ประเภทธุรกิจ", "เข้าชม"]}
            rows={o.tsic.map((t) => [
              <span key="t">
                <Link href={drill({ type: "tsic", id: t.id })}>{t.name ?? t.id}</Link>{" "}
                <a href={tsicUrl(t.id)} target="_blank" rel="noopener" className="text-xs">
                  ↗
                </a>
              </span>,
              formatNumber(t.views),
            ])}
          />
        </AdminCard>

        <AdminCard title="อุปกรณ์ / เบราว์เซอร์ / ระบบปฏิบัติการ">
          <div className="grid gap-4 text-sm">
            {(
              [
                ["อุปกรณ์", o.devices],
                ["เบราว์เซอร์", o.browsers],
                ["ระบบปฏิบัติการ", o.oses],
              ] as const
            ).map(([title, list]) => (
              <div key={title}>
                <div className="mb-1 font-bold">{title}</div>
                {list.length ? <ShareBar parts={list.slice(0, 5).map((d) => ({ label: d.key, value: d.n }))} /> : <p className="text-wiki-muted">-</p>}
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard title="ช่วงเวลาที่เข้าชม (เวลาไทย)">
          <div className="flex h-36 items-end gap-0.5">
            {o.hourly.map((h) => (
              <div key={h.hour} className="flex h-full flex-1 flex-col justify-end" title={`${h.hour}:00 น. — ${formatNumber(h.n)} ครั้ง`}>
                <div className="w-full bg-[#3366cc]" style={{ height: `${(h.n / maxHour) * 100}%`, minHeight: h.n ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-wiki-muted">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
          <h3 className="mt-4 mb-1 text-sm font-bold">ออนไลน์ตอนนี้ — {formatNumber(rt.visitors)} คน · {formatNumber(rt.views)} หน้า (30 นาทีล่าสุด)</h3>
          <ul className="text-sm">
            {rt.pages.map((p) => (
              <li key={p.path} className="flex justify-between gap-2">
                <a href={p.path} target="_blank" rel="noopener" className="truncate">
                  {decodeSafe(p.path)}
                </a>
                <span className="text-wiki-muted tabular-nums">{p.n}</span>
              </li>
            ))}
            {rt.pages.length === 0 && <li className="text-wiki-muted">ไม่มี</li>}
          </ul>
        </AdminCard>
      </div>
    </>
  );
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function RankTable({ head, rows }: { head: string[]; rows: Array<Array<React.ReactNode>> }) {
  if (rows.length === 0) return <p className="text-sm text-wiki-muted">ยังไม่มีข้อมูลในช่วงนี้</p>;
  return (
    <table className="wikitable">
      <thead>
        <tr>
          <th scope="col" className="w-8">
            #
          </th>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="text-center text-xs text-wiki-muted tabular-nums">{i + 1}</td>
            {r.map((c, j) => (
              <td key={j} className={j === 0 ? "max-w-72 truncate" : "text-right tabular-nums"}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
