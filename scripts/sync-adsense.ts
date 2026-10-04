/**
 * ดึงรายงานรายได้ Google AdSense → ตาราง adsense_report (หน้า /admin/ads แสดงผล)
 *
 *   npm run sync:adsense                 # 35 วันล่าสุด (AdSense ปรับตัวเลขย้อนหลังได้ จึงดึงซ้ำทุกวัน)
 *   npm run sync:adsense -- --days=365   # ย้อนหลังนานขึ้น
 *
 * ต้องเชื่อมต่อบัญชีที่ /admin/ads ก่อน — ยังไม่เชื่อมต่อ = จบงานเฉย ๆ (ไม่ถือว่าผิดพลาด)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const TOTAL = "__total__";

async function main() {
  const { getPool, closePool } = await import("@/lib/db");
  const { adsenseAccessToken, adsenseReport } = await import("@/lib/adsense-api");
  const pool = getPool();
  type Row = import("mysql2").RowDataPacket;
  const [settings] = await pool.query<Row[]>(`SELECT k, v FROM app_setting WHERE k IN ('adsense_refresh_token', 'adsense_account')`);
  const get = (k: string) => settings.find((r) => r.k === k)?.v as string | undefined;
  const refresh = get("adsense_refresh_token");
  const account = get("adsense_account");
  if (!refresh || !account) {
    console.log("ยังไม่ได้เชื่อมต่อบัญชี AdSense ที่ /admin/ads — ข้าม");
    await closePool();
    return;
  }

  const days = Math.max(1, Math.min(1095, Number(arg("days") ?? 35)));
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86400_000).toISOString().slice(0, 10);
  console.log(`▶ ดึงรายงาน ${account} ช่วง ${from} – ${today}`);

  const token = await adsenseAccessToken(refresh);
  const [byDate, byUnit] = await Promise.all([
    adsenseReport(token, account, from, today, ["DATE"]),
    adsenseReport(token, account, from, today, ["DATE", "AD_UNIT_NAME"]),
  ]);
  const num = (v: string | undefined) => Number(v ?? 0) || 0;
  const rows = [
    ...byDate.map((r) => [r.DATE, TOTAL, num(r.ESTIMATED_EARNINGS), num(r.PAGE_VIEWS), num(r.IMPRESSIONS), num(r.CLICKS)]),
    ...byUnit.map((r) => [r.DATE, (r.AD_UNIT_NAME || "(Auto ads)").slice(0, 255), num(r.ESTIMATED_EARNINGS), num(r.PAGE_VIEWS), num(r.IMPRESSIONS), num(r.CLICKS)]),
  ].filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r[0])));

  // แทนที่ข้อมูลช่วงที่ดึงใหม่ทั้งหมด (ตัวเลขย้อนหลังอาจถูก AdSense ปรับ)
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM adsense_report WHERE report_date BETWEEN ? AND ?`, [from, today]);
    if (rows.length) {
      await conn.query(`INSERT INTO adsense_report (report_date, ad_unit, earnings, page_views, impressions, clicks) VALUES ?`, [rows]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  await pool.query(
    `INSERT INTO app_setting (k, v) VALUES ('adsense_synced_at', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s')) ON DUPLICATE KEY UPDATE v = VALUES(v)`,
  );
  const earnings = byDate.reduce((s, r) => s + num(r.ESTIMATED_EARNINGS), 0);
  console.log(`✔ บันทึก ${rows.length} แถว — รายได้ประมาณการ ${days} วัน: ${earnings.toFixed(2)} บาท`);
  await closePool();
}

main().catch((err) => {
  console.error("✖ sync-adsense failed:", err);
  process.exit(1);
});
