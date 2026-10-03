/**
 * รันงาน 1 งานพร้อมบันทึก log ลงตาราง job_run (หน้า /admin แสดงผลแบบสด)
 *
 *   npx tsx scripts/run-job.ts <job_key> [--trigger=manual:a@b.com] [--run-id=123] [args ...]
 *
 * - ถ้าส่ง --run-id มา จะใช้แถว job_run ที่สร้างไว้แล้ว (กรณีกด "รันตอนนี้" จากเว็บ)
 * - กันรันซ้อน: ถ้างานเดียวกันยัง running และมี heartbeat ใหม่ จะไม่รัน
 * - เก็บ log ล่าสุดไม่เกิน ~200 KB ต่อรอบ
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const MAX_LOG = 200_000;
const FLUSH_MS = 3_000;

async function main() {
  const [jobKey, ...rest] = process.argv.slice(2);
  const opt = (n: string) => rest.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  const passthrough = rest.filter((a) => !a.startsWith("--trigger=") && !a.startsWith("--run-id="));

  const { getPool, closePool } = await import("@/lib/db");
  const { jobByKey, parseArgs } = await import("@/lib/jobs");
  const job = jobByKey(jobKey ?? "");
  if (!job) throw new Error(`ไม่รู้จักงาน: ${jobKey}`);
  const pool = getPool();
  type Row = import("mysql2").RowDataPacket;

  // ล้างรอบที่ค้าง (ไม่มี heartbeat เกินเวลา) ของงานนี้
  await pool.query(
    `UPDATE job_run SET status = 'stale', finished_at = NOW()
     WHERE job_key = ? AND status = 'running' AND COALESCE(heartbeat_at, started_at) < NOW() - INTERVAL ? MINUTE`,
    [job.key, job.staleMinutes],
  );

  let runId = Number(opt("run-id")) || 0;
  const [running] = await pool.query<Row[]>(
    `SELECT id FROM job_run WHERE job_key = ? AND status = 'running' AND id <> ? LIMIT 1`,
    [job.key, runId],
  );
  if (running[0]) {
    const msg = `ข้าม: งาน ${job.key} กำลังรันอยู่ (run #${running[0].id})`;
    console.log(msg);
    if (runId) await pool.query(`UPDATE job_run SET status = 'failed', log = ?, finished_at = NOW() WHERE id = ?`, [msg, runId]);
    await closePool();
    return;
  }

  const [sched] = await pool.query<Row[]>(`SELECT args FROM job_schedule WHERE job_key = ?`, [job.key]);
  const args = [...(job.baseArgs ?? []), ...(passthrough.length ? parseArgs(passthrough.join(" ")) : parseArgs(sched[0]?.args))];

  if (!runId) {
    const [res] = await pool.query<import("mysql2").ResultSetHeader>(
      `INSERT INTO job_run (job_key, trigger_by, args, status, started_at, heartbeat_at) VALUES (?, ?, ?, 'running', NOW(), NOW())`,
      [job.key, opt("trigger") ?? "schedule", args.join(" ")],
    );
    runId = res.insertId;
  } else {
    await pool.query(`UPDATE job_run SET args = ?, status = 'running', started_at = NOW(), heartbeat_at = NOW() WHERE id = ?`, [
      args.join(" "),
      runId,
    ]);
  }

  // รันสคริปต์ด้วย tsx ตัวเดียวกับที่ใช้รันไฟล์นี้
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsxCli, path.join("scripts", job.script), ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await pool.query(`UPDATE job_run SET pid = ? WHERE id = ?`, [child.pid ?? null, runId]);

  let log = `$ ${job.script} ${args.join(" ")}\n`;
  let dirty = true;
  const append = (chunk: Buffer) => {
    process.stdout.write(chunk);
    log += chunk.toString("utf8");
    if (log.length > MAX_LOG) log = "…(ตัดส่วนต้น)…\n" + log.slice(-MAX_LOG);
    dirty = true;
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  const flush = async () => {
    if (!dirty) return pool.query(`UPDATE job_run SET heartbeat_at = NOW() WHERE id = ?`, [runId]);
    dirty = false;
    return pool.query(`UPDATE job_run SET log = ?, heartbeat_at = NOW() WHERE id = ?`, [log, runId]);
  };
  const timer = setInterval(() => void flush().catch(() => {}), FLUSH_MS);

  const code: number = await new Promise((resolve) => {
    child.on("close", (c) => resolve(c ?? 1));
    child.on("error", (e) => {
      append(Buffer.from(`\n✖ start failed: ${e.message}\n`));
      resolve(1);
    });
  });
  clearInterval(timer);
  await pool.query(`UPDATE job_run SET log = ?, status = ?, exit_code = ?, finished_at = NOW(), heartbeat_at = NOW() WHERE id = ?`, [
    log,
    code === 0 ? "success" : "failed",
    code,
    runId,
  ]);
  await closePool();
  process.exitCode = code;
}

main().catch((err) => {
  console.error("✖ run-job failed:", err);
  process.exit(1);
});
