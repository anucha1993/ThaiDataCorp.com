/**
 * ตัวจัดตารางงาน — ตั้ง Scheduled Task บน Plesk ให้รันทุก 5 นาที:
 *
 *   cd /path/to/thaidatacorp && npm run jobs:tick
 *
 * ทุกครั้งที่รัน: หางานที่ถึงเวลา (next_run_at) หรือถูกกด "รันตอนนี้" (requested_at)
 * แล้วเริ่มงานแบบแยก process (ไม่รอให้จบ) จากนั้นคำนวณเวลารันครั้งถัดไปจาก cron
 * ตารางเวลาแก้ได้ที่หน้า /admin/jobs โดยไม่ต้องแก้ Scheduled Task อีก
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getPool, closePool } = await import("@/lib/db");
  const { jobByKey, nextRunUtc } = await import("@/lib/jobs");
  const pool = getPool();
  type Row = import("mysql2").RowDataPacket;

  // next_run_at / requested_at เก็บเป็นเวลา UTC เสมอ เทียบกับ UTC_TIMESTAMP()
  const [rows] = await pool.query<Row[]>(
    `SELECT job_key, enabled, cron, next_run_at, requested_at,
       (enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= UTC_TIMESTAMP()) due,
       (requested_at IS NOT NULL) requested
     FROM job_schedule`,
  );

  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  for (const r of rows) {
    const job = jobByKey(r.job_key);
    if (!job) continue;

    // ตั้ง next_run_at ให้งานที่เปิดใช้แต่ยังไม่มีเวลา (เช่น เพิ่งเปิด)
    if (r.enabled && !r.next_run_at) {
      await pool.query(`UPDATE job_schedule SET next_run_at = ? WHERE job_key = ?`, [await nextRunUtc(r.cron), r.job_key]);
      continue;
    }
    if (!Number(r.due) && !Number(r.requested)) continue;

    const trigger = Number(r.requested) ? "manual" : "schedule";
    await pool.query(
      `UPDATE job_schedule SET requested_at = NULL, next_run_at = IF(enabled = 1 AND ? = 1, ?, next_run_at) WHERE job_key = ?`,
      [Number(r.due), await nextRunUtc(r.cron), r.job_key],
    );
    const child = spawn(process.execPath, [tsxCli, path.join("scripts", "run-job.ts"), job.key, `--trigger=${trigger}`], {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    console.log(`▶ เริ่ม ${job.key} (${trigger}) pid=${child.pid}`);
  }
  // บันทึกเวลาที่ tick ทำงานล่าสุด (หน้า /admin ใช้ตรวจว่า Scheduled Task ยังทำงานอยู่)
  await pool.query(
    `INSERT INTO app_setting (k, v) VALUES ('jobs_last_tick', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s'))
     ON DUPLICATE KEY UPDATE v = VALUES(v)`,
  );
  await closePool();
}

main().catch((err) => {
  console.error("✖ jobs-tick failed:", err);
  process.exit(1);
});
