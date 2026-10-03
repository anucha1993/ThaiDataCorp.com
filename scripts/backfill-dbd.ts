/**
 * เติมข้อมูลทะเบียนนิติบุคคลจาก DBD Open API ให้บริษัทที่ "รู้เลขทะเบียนแล้ว" แต่ยังไม่มีในตาราง juristic
 *
 *   npm run backfill:dbd                       # ผู้ชนะงานภาครัฐ (e-GP) ที่ยังไม่มีข้อมูล เรียงตามมูลค่างาน
 *   npm run backfill:dbd -- --limit=500        # จำกัดจำนวนต่อรอบ
 *   npm run backfill:dbd -- --ids=ids.txt      # จากไฟล์รายชื่อเลขทะเบียน (บรรทัดละ 1 เลข)
 *   npm run backfill:dbd -- --rate=1           # request ต่อวินาที (ค่าเริ่มต้น 1)
 *
 * ใช้เฉพาะเลขทะเบียนที่ได้มาจากแหล่งข้อมูลจริง (ไม่สุ่ม/ไล่เลข) และยิงช้า ๆ เพราะ API อยู่หลัง WAF
 * ถ้าเจอข้อผิดพลาดติดกันหลายครั้ง (เช่นโดน WAF) จะพักแล้วหยุดเอง — รันต่อรอบหน้าได้ เพราะข้ามเลขที่ทำแล้ว
 */
import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_PAUSE_MS = 60_000;

async function main() {
  const { getPool, closePool } = await import("@/lib/db");
  const { fetchDbdJuristic } = await import("@/lib/dbd-openapi");
  const { normalizeProfile } = await import("@/lib/dbd-normalize");
  const { upsertDbdProfile } = await import("@/lib/juristic-write");
  const { isNonDbdTaxId, isValidJuristicId } = await import("@/lib/juristic-id");

  const pool = getPool();
  const rate = Math.max(0.1, Math.min(5, Number(arg("rate") ?? 1)));
  const limit = Number(arg("limit") ?? 0) || undefined;
  const idsFile = arg("ids");

  let ids: string[];
  if (idsFile) {
    const fromFile = readFileSync(idsFile, "utf8").split(/\r?\n/).map((s) => s.replace(/\D/g, ""))
      .filter((id) => isValidJuristicId(id) && !isNonDbdTaxId(id));
    const [done] = await pool.query<import("mysql2").RowDataPacket[]>(
      `SELECT id FROM juristic WHERE id IN (?) UNION SELECT id FROM dbd_fetch_log WHERE id IN (?) AND status <> 'error'`,
      [fromFile.length ? fromFile : ["-"], fromFile.length ? fromFile : ["-"]],
    );
    const skip = new Set(done.map((r) => r.id as string));
    ids = fromFile.filter((id) => !skip.has(id));
  } else {
    const [rows] = await pool.query<import("mysql2").RowDataPacket[]>(
      `SELECT s.winner_id AS id FROM procurement_summary s
       LEFT JOIN juristic j ON j.id = s.winner_id
       LEFT JOIN dbd_fetch_log l ON l.id = s.winner_id AND l.status <> 'error'
       WHERE j.id IS NULL AND l.id IS NULL AND s.winner_id NOT LIKE '099%'
       ORDER BY s.total_value DESC`,
    );
    ids = rows.map((r) => r.id as string);
  }
  if (limit) ids = ids.slice(0, limit);
  console.log(`▶ ต้องดึง ${ids.length.toLocaleString()} ราย ที่ ${rate} req/s (~${Math.ceil(ids.length / rate / 60)} นาที)`);

  const log = (id: string, status: string) =>
    pool.query(`INSERT INTO dbd_fetch_log (id, status, fetched_at) VALUES (?, ?, NOW())
                ON DUPLICATE KEY UPDATE status = VALUES(status), fetched_at = NOW()`, [id, status]);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let found = 0;
  let notFound = 0;
  let errors = 0;
  let consecutive = 0;
  const started = Date.now();

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const t0 = Date.now();
    try {
      const raw = await fetchDbdJuristic(id);
      if (raw) {
        await upsertDbdProfile(normalizeProfile(raw));
        await log(id, "found");
        found++;
      } else {
        await log(id, "not_found");
        notFound++;
      }
      consecutive = 0;
    } catch (err) {
      errors++;
      consecutive++;
      await log(id, "error");
      console.warn(`  ! ${id}: ${(err as Error).message}`);
      if (consecutive >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`✖ ผิดพลาดติดกัน ${consecutive} ครั้ง (อาจโดน WAF) — หยุดรอบนี้ รันใหม่ภายหลังได้`);
        break;
      }
      await sleep(ERROR_PAUSE_MS);
    }
    if ((i + 1) % 100 === 0) {
      const mins = (Date.now() - started) / 60000;
      console.log(`  … ${i + 1}/${ids.length} — พบ ${found} ไม่พบ ${notFound} ผิดพลาด ${errors} (${mins.toFixed(1)} นาที)`);
    }
    const wait = 1000 / rate - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
  }

  console.log(`✔ เสร็จ — พบ ${found.toLocaleString()} | ไม่พบ ${notFound.toLocaleString()} | ผิดพลาด ${errors.toLocaleString()}`);
  await closePool();
}

main().catch((err) => {
  console.error("✖ backfill failed:", err);
  process.exit(1);
});
