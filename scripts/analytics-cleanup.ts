/**
 * ล้างข้อมูลสถิติตามระยะเวลาที่แจ้งในนโยบายความเป็นส่วนตัว
 *   - IP ในตาราง page_view: เก็บ 90 วัน แล้วตั้งเป็น NULL
 *   - ข้อมูลการเข้าชมดิบ: เก็บ 400 วัน แล้วลบ
 *
 *   npm run job -- analytics-cleanup     (หรือรันจากหน้า /admin/jobs — ตั้งไว้ทุกวัน 03:20)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const IP_DAYS = 90;
const VIEW_DAYS = 400;
const BATCH = 50_000;

async function main() {
  const { dbQuery, closePool } = await import("@/lib/db");
  type Res = import("mysql2").ResultSetHeader;
  let ips = 0;
  let views = 0;
  // ทำเป็นชุด กัน lock ตารางนาน
  for (;;) {
    const r = await dbQuery<Res>(
      `UPDATE page_view SET ip = NULL WHERE ip IS NOT NULL AND ts < UTC_TIMESTAMP() - INTERVAL ? DAY LIMIT ?`,
      [IP_DAYS, BATCH],
    );
    ips += r.affectedRows;
    if (r.affectedRows < BATCH) break;
  }
  for (;;) {
    const r = await dbQuery<Res>(`DELETE FROM page_view WHERE ts < UTC_TIMESTAMP() - INTERVAL ? DAY LIMIT ?`, [VIEW_DAYS, BATCH]);
    views += r.affectedRows;
    if (r.affectedRows < BATCH) break;
  }
  console.log(`ลบ IP เกิน ${IP_DAYS} วัน: ${ips.toLocaleString()} แถว · ลบการเข้าชมเกิน ${VIEW_DAYS} วัน: ${views.toLocaleString()} แถว`);
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
