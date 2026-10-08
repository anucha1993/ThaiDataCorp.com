/**
 * ตัวจัดตารางงาน — ตั้ง Scheduled Task บน Plesk ให้รันทุก 5 นาที:
 *
 *   cd /path/to/thaidatacorp && npm run jobs:tick
 *   (หรือ Fetch a URL: /api/cron/tick?key=CRON_SECRET)
 *
 * ทุกครั้งที่รัน:
 *   1) ปิดรอบที่ค้าง — process ที่ไม่มี heartbeat เกินเวลา (เช่น ถูกระบบปิดเพราะหน่วยความจำเกินโควตาโฮสต์)
 *      จะถูกตั้งเป็น "ค้าง" พร้อมเหตุผล ไม่ค้างสถานะ "กำลังรัน" ตลอดไป
 *   2) เริ่มงานที่ถึงเวลา (next_run_at) หรือถูกกด "รันตอนนี้" (requested_at) — ทีละ 1 งาน
 *      ถ้ามีงานรันอยู่ งานที่ถึงเวลาจะรอรอบ tick ถัดไป (กันหลายงานกินหน่วยความจำพร้อมกันจนถูกปิด)
 * ตารางเวลาแก้ได้ที่หน้า /admin/jobs โดยไม่ต้องแก้ Scheduled Task อีก
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/** งานที่รันพร้อมกันได้สูงสุด */
const MAX_CONCURRENT = 1;

async function main() {
  const { getPool, closePool } = await import("@/lib/db");
  const { JOBS, jobByKey, nextRunUtc } = await import("@/lib/jobs");
  const pool = getPool();
  type Row = import("mysql2").RowDataPacket;

  // 1) รอบที่ process หายไปแล้ว (ไม่มี heartbeat เกิน staleMinutes ของงานนั้น) → ค้าง
  for (const job of JOBS) {
    const [res] = await pool.query<import("mysql2").ResultSetHeader>(
      `UPDATE job_run SET status = 'stale', finished_at = NOW(),
         log = CONCAT(COALESCE(log, ''), '\n✖ process หยุดกะทันหันโดยไม่ได้บันทึกผล (heartbeat ล่าสุด ', COALESCE(heartbeat_at, started_at),
           ') — มักเกิดจากหน่วยความจำเกินโควตาของโฮสต์ หรือเซิร์ฟเวอร์รีสตาร์ต · กด "รันตอนนี้" เพื่อรันใหม่')
       WHERE job_key = ? AND status = 'running' AND COALESCE(heartbeat_at, started_at) < NOW() - INTERVAL ? MINUTE`,
      [job.key, job.staleMinutes],
    );
    if (res.affectedRows) console.log(`⚠ ${job.key}: ปิดรอบที่ค้าง ${res.affectedRows} รอบ`);
  }

  const [[{ n: runningNow }]] = await pool.query<Row[]>(`SELECT COUNT(*) n FROM job_run WHERE status = 'running'`);
  let slots = MAX_CONCURRENT - Number(runningNow);

  // next_run_at / requested_at เก็บเป็นเวลา UTC เสมอ เทียบกับ UTC_TIMESTAMP()
  const [rows] = await pool.query<Row[]>(
    `SELECT job_key, enabled, cron, next_run_at, requested_at,
       (enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= UTC_TIMESTAMP()) due,
       (requested_at IS NOT NULL) requested
     FROM job_schedule
     ORDER BY requested_at IS NULL, COALESCE(requested_at, next_run_at)`,
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
    if (slots <= 0) {
      console.log(`… ${job.key} ถึงเวลาแล้ว แต่มีงานรันอยู่ — รอรอบถัดไป`);
      continue;
    }

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
    slots--;
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
