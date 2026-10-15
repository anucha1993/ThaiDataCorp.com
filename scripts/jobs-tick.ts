/**
 * ตัวจัดตารางงานแบบบรรทัดคำสั่ง — ใช้เมื่อ Scheduled Task รันคำสั่งได้ (shell ไม่ chroot):
 *
 *   cd /path/to/thaidatacorp && npm run jobs:tick
 *
 * บน Plesk ที่ shell เป็น chroot ให้ใช้ Fetch a URL: /api/cron/tick?key=CRON_SECRET แทน (ทำงานแบบเดียวกัน)
 * รายละเอียดการทำงานดู lib/jobs-tick.ts · ตารางเวลาแก้ได้ที่หน้า /admin/jobs
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { closePool } = await import("@/lib/db");
  const { runJobsTick } = await import("@/lib/jobs-tick");
  await runJobsTick((m) => console.log(m));
  await closePool();
}

main().catch((err) => {
  console.error("✖ jobs-tick failed:", err);
  process.exit(1);
});
