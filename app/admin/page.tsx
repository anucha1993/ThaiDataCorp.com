import Link from "next/link";
import AdminCard, { RunStatus, Stat } from "@/components/AdminCard";
import { getDashboard } from "@/lib/admin-repo";
import { formatNumber } from "@/lib/format";
import { JOBS, utcToThai } from "@/lib/jobs";
import { getSetting } from "@/lib/settings";

export default async function AdminDashboard() {
  const [d, lastTick] = await Promise.all([getDashboard(), getSetting("jobs_last_tick")]);
  const tickAgeMin = lastTick ? Math.round((Date.now() - new Date(`${lastTick.replace(" ", "T")}Z`).getTime()) / 60000) : null;

  return (
    <>
      <AdminCard title="ภาพรวม">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="นิติบุคคลใน DB" value={formatNumber(d.companies)} note={`+${formatNumber(d.companies7d)} ใน 7 วัน`} />
          <Stat label="สัญญาภาครัฐ" value={formatNumber(d.contracts)} note={`${formatNumber(d.winners)} บริษัทผู้ชนะ`} />
          <Stat label="สมาชิก" value={formatNumber(d.users)} note={`ใหม่ 30 วัน: ${formatNumber(d.newUsers30d)}`} />
          <Stat label="สมาชิกเสียเงิน (ใช้งานอยู่)" value={formatNumber(d.paying)} />
          <Stat label="รายได้เดือนนี้" value={`${formatNumber(d.revenueThisMonth)} ฿`} note={`รวมทั้งหมด ${formatNumber(d.revenueAllTime)} ฿`} />
          <Stat
            label="คำสั่งซื้อรอดำเนินการ"
            value={<Link href="/admin/orders">{formatNumber(d.ordersWaiting)}</Link>}
            note={d.ordersSubmitted ? `แจ้งโอนแล้ว ${d.ordersSubmitted} รายการ` : undefined}
          />
          <Stat label="ขนาด DB" value={`${formatNumber(d.totalMb)} MB`} />
          <Stat
            label="ตัวจัดตารางงาน (jobs:tick)"
            value={tickAgeMin === null ? "ยังไม่เคยรัน" : tickAgeMin <= 10 ? "ทำงานปกติ" : "ไม่ได้รัน"}
            note={lastTick ? `ล่าสุด ${utcToThai(lastTick)}` : "ตั้ง Scheduled Task ทุก 5 นาที"}
          />
        </div>
      </AdminCard>

      <AdminCard title="สถานะงานล่าสุด" actions={<Link href="/admin/jobs">จัดการงาน →</Link>}>
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">งาน</th>
              <th scope="col">รอบล่าสุด</th>
              <th scope="col">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {JOBS.map((j) => {
              const r = d.lastRuns.get(j.key);
              return (
                <tr key={j.key}>
                  <td>{j.label}</td>
                  <td className="text-sm">{r ? <Link href={`/admin/jobs/${r.id}`}>{String(r.started_at)}</Link> : "-"}</td>
                  <td>{r ? <RunStatus status={r.status} /> : <span className="text-xs text-wiki-muted">ยังไม่เคยรัน</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AdminCard>

      <AdminCard title="ขนาดตารางในฐานข้อมูล">
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">ตาราง</th>
              <th scope="col">แถว (ประมาณ)</th>
              <th scope="col">ขนาด (MB)</th>
            </tr>
          </thead>
          <tbody>
            {d.tables.map((t) => (
              <tr key={t.name}>
                <td className="font-mono text-sm">{t.name}</td>
                <td className="text-right tabular-nums">{formatNumber(t.rows)}</td>
                <td className="text-right tabular-nums">{formatNumber(t.mb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </>
  );
}
