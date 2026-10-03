import Link from "next/link";
import { notFound } from "next/navigation";
import { stopRun } from "@/app/admin/actions";
import AdminCard, { duration, RunStatus } from "@/components/AdminCard";
import { buttonCls } from "@/components/Panel";
import { getRun } from "@/lib/admin-repo";
import { jobByKey } from "@/lib/jobs";

type Props = { params: Promise<{ id: string }> };

/** log ของการรัน 1 รอบ — ระหว่างรันหน้าจะรีเฟรชเองทุก 5 วินาที (ไม่ต้องใช้ JavaScript) */
export default async function RunPage({ params }: Props) {
  const id = Number((await params).id);
  const run = Number.isInteger(id) && id > 0 ? await getRun(id) : null;
  if (!run) notFound();
  const job = jobByKey(run.job_key);
  const running = run.status === "running";

  return (
    <AdminCard
      title={`Run #${run.id} — ${job?.label ?? run.job_key}`}
      actions={
        <>
          <Link href="/admin/jobs">← กลับ</Link>
          {running && (
            <form action={stopRun}>
              <input type="hidden" name="id" value={run.id} />
              <button type="submit" className={`${buttonCls} py-0.5 text-red-800`}>
                ■ หยุดงาน
              </button>
            </form>
          )}
        </>
      }
    >
      {running && <meta httpEquiv="refresh" content="5" />}
      <table className="wikitable mb-3">
        <tbody>
          {[
            ["สถานะ", <RunStatus key="s" status={run.status} />],
            ["เริ่ม", String(run.started_at)],
            ["จบ", run.finished_at ? String(run.finished_at) : running ? "กำลังรัน…" : "-"],
            ["ใช้เวลา", duration(run.secs)],
            ["exit code", run.exit_code ?? "-"],
            ["สั่งโดย", run.trigger_by],
            ["args", <code key="a">{run.args || "-"}</code>],
            ["heartbeat ล่าสุด", run.heartbeat_at ? String(run.heartbeat_at) : "-"],
          ].map(([k, v]) => (
            <tr key={String(k)}>
              <th scope="row" className="text-left!">
                {k}
              </th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <pre className="max-h-[70vh] overflow-auto border border-wiki-border bg-[#1e1e1e] p-3 text-xs leading-5 whitespace-pre-wrap text-[#d4d4d4]">
        {run.log || "(ยังไม่มี log)"}
      </pre>
      {running && <p className="mt-2 text-xs text-wiki-muted">หน้านี้รีเฟรชอัตโนมัติทุก 5 วินาทีระหว่างที่งานกำลังรัน</p>}
    </AdminCard>
  );
}
