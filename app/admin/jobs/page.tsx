import Link from "next/link";
import { runJobNow, saveJob } from "@/app/admin/actions";
import AdminCard, { duration, RunStatus } from "@/components/AdminCard";
import { Notice, buttonCls, inputCls, primaryButtonCls } from "@/components/Panel";
import { listJobs, listRuns } from "@/lib/admin-repo";
import { CRON_PRESETS, utcToThai } from "@/lib/jobs";
import { getSetting } from "@/lib/settings";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MSG: Record<string, { tone: "ok" | "error" | "info"; text: string }> = {
  "ok:saved": { tone: "ok", text: "บันทึกตารางเวลาแล้ว" },
  "ok:started": { tone: "ok", text: "เริ่มรันงานแล้ว — ดูความคืบหน้าในตารางประวัติด้านล่าง (รีเฟรชหน้า)" },
  "ok:queued": { tone: "info", text: "เริ่มงานจากเว็บไม่ได้ จึงเข้าคิวไว้ให้ jobs:tick รันในรอบถัดไป (ภายใน 5 นาที)" },
  "error:cron": { tone: "error", text: "รูปแบบ cron ไม่ถูกต้อง (ต้องมี 5 ช่อง: นาที ชั่วโมง วัน เดือน วันในสัปดาห์)" },
  "error:job": { tone: "error", text: "ไม่พบงาน" },
};

export default async function JobsPage({ searchParams }: Props) {
  const q = await searchParams;
  const msg = one(q.ok) ? MSG[`ok:${one(q.ok)}`] : one(q.error) ? MSG[`error:${one(q.error)}`] : undefined;
  const filter = one(q.job);
  const [jobs, runs, lastTick] = await Promise.all([listJobs(), listRuns(one(q.history) ?? undefined, 50), getSetting("jobs_last_tick")]);

  return (
    <>
      <AdminCard title="งาน Sync และงานเบื้องหลัง">
        {msg && <Notice tone={msg.tone}>{msg.text}{filter ? ` (${filter})` : ""}</Notice>}
        <p className="mb-4 text-sm leading-6 text-wiki-muted">
          เวลาเป็นเวลาไทย (cron 5 ช่อง: นาที ชั่วโมง วันที่ เดือน วันในสัปดาห์) — งานที่เปิดใช้จะถูกเริ่มโดย <code>npm run jobs:tick</code>{" "}
          ซึ่งต้องตั้ง Scheduled Task บน Plesk ให้รันทุก 5 นาที (tick ล่าสุด: {utcToThai(lastTick)})
        </p>

        <div className="space-y-4">
          {jobs.map((j) => (
            <div key={j.key} id={`job-${j.key}`} className="border border-wiki-border-light p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <b>{j.label}</b>
                <code className="text-xs text-wiki-muted">{j.key}</code>
                {j.last && (
                  <Link href={`/admin/jobs/${j.last.id}`} className="text-xs">
                    <RunStatus status={j.last.status} /> {j.last.startedAt}
                  </Link>
                )}
                <form action={runJobNow} className="ml-auto flex items-center gap-1">
                  <input type="hidden" name="key" value={j.key} />
                  <input name="args" placeholder="args ครั้งนี้ (ไม่บังคับ)" className={`${inputCls} w-44 py-0.5 text-xs`} />
                  <button type="submit" className={`${primaryButtonCls} py-0.5 text-sm`}>
                    ▶ รันตอนนี้
                  </button>
                </form>
              </div>
              <p className="mb-2 text-xs text-wiki-muted">{j.description}</p>
              <form action={saveJob} className="flex flex-wrap items-end gap-2 text-sm">
                <input type="hidden" name="key" value={j.key} />
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="enabled" defaultChecked={j.enabled} /> เปิดใช้ตามเวลา
                </label>
                <label className="flex flex-col">
                  <span className="text-xs">cron</span>
                  <input name="cron" defaultValue={j.cron} list="cron-presets" className={`${inputCls} w-36 font-mono`} />
                </label>
                <label className="flex flex-col">
                  <span className="text-xs">args ประจำ</span>
                  <input name="args" defaultValue={j.args ?? ""} placeholder="เช่น --limit=3000" className={`${inputCls} w-44 font-mono`} />
                </label>
                <button type="submit" className={buttonCls}>
                  บันทึก
                </button>
                <span className="text-xs text-wiki-muted">
                  ครั้งถัดไป: {j.enabled ? utcToThai(j.nextRunAt) : "ปิดอยู่"}
                  {j.requestedAt && " · อยู่ในคิวรันทันที"}
                </span>
              </form>
            </div>
          ))}
        </div>
        <datalist id="cron-presets">
          {CRON_PRESETS.map((p) => (
            <option key={p.cron} value={p.cron}>
              {p.label}
            </option>
          ))}
        </datalist>
        <details className="mt-3 text-xs text-wiki-muted">
          <summary className="cursor-pointer">ตัวอย่าง cron</summary>
          <ul className="mt-1 list-disc pl-5">
            {CRON_PRESETS.map((p) => (
              <li key={p.cron}>
                <code>{p.cron}</code> — {p.label}
              </li>
            ))}
          </ul>
        </details>
      </AdminCard>

      <AdminCard
        title="ประวัติการรัน"
        actions={
          <>
            <Link href="/admin/jobs">ทั้งหมด</Link>
            {jobs.map((j) => (
              <Link key={j.key} href={`/admin/jobs?history=${j.key}`}>
                {j.key}
              </Link>
            ))}
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="wikitable">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">งาน</th>
                <th scope="col">เริ่ม</th>
                <th scope="col">ใช้เวลา</th>
                <th scope="col">สถานะ</th>
                <th scope="col">สั่งโดย</th>
                <th scope="col">args</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/jobs/${r.id}`}>{r.id}</Link>
                  </td>
                  <td className="font-mono text-xs">{r.job_key}</td>
                  <td className="text-sm whitespace-nowrap">{String(r.started_at)}</td>
                  <td className="text-sm whitespace-nowrap">{duration(r.secs)}</td>
                  <td>
                    <RunStatus status={r.status} />
                  </td>
                  <td className="text-xs">{r.trigger_by}</td>
                  <td className="font-mono text-xs">{r.args}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-sm text-wiki-muted">
                    ยังไม่มีประวัติ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </>
  );
}
