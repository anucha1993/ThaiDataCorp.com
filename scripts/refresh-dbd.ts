/**
 * ทยอยอัปเดตข้อมูลทะเบียนนิติบุคคลที่มีใน DB ให้ตรงกับ DBD Open API (ชื่อ ทุน ประเภทธุรกิจ สถานะ ที่อยู่)
 * — ข้อมูล Open-D เป็นข้อมูล ณ วันจดทะเบียน บริษัทเปลี่ยนชื่อ/เพิ่มทุนภายหลังได้
 *
 *   npm run refresh:dbd                      # รอบละ 1,000 ราย ที่ 1 req/s
 *   npm run refresh:dbd -- --limit=500 --rate=1 --days=30
 *
 * ลำดับ: บัญชีบริษัทที่ยืนยันแล้ว → บริษัทที่มีคนเข้าชมใน 30 วัน → ผู้ชนะงานภาครัฐ → ยังดำเนินกิจการ (ที่ไม่เคยตรวจ/ตรวจนานสุดก่อน)
 * ข้ามรายที่ตรวจไว้ไม่เกิน --days วัน และบริษัทที่เลิกแล้วซึ่งเคยตรวจแล้ว (ข้อมูลไม่เปลี่ยน)
 * ผิดพลาดติดกัน 5 ครั้ง (เช่นโดน WAF) จะหยุดรอบนี้ — รอบหน้าทำต่อได้
 */
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

  const pool = getPool();
  const rate = Math.max(0.1, Math.min(3, Number(arg("rate") ?? 1)));
  const limit = Math.max(1, Number(arg("limit") ?? 1000));
  const days = Math.max(1, Number(arg("days") ?? 30));

  const stale = `(j.dbd_fetched_at IS NULL OR (j.dbd_fetched_at < NOW() - INTERVAL ${days} DAY AND j.dissolved_date IS NULL))
                 AND j.id NOT LIKE '099%'`;
  const tiers = [
    `SELECT DISTINCT j.id FROM company_member m JOIN juristic j ON j.id = m.juristic_id WHERE ${stale}`,
    `SELECT j.id FROM (SELECT entity_id, COUNT(*) c FROM page_view
       WHERE entity_type = 'company' AND ts > UTC_TIMESTAMP() - INTERVAL 30 DAY GROUP BY entity_id) v
     JOIN juristic j ON j.id = v.entity_id WHERE ${stale} ORDER BY v.c DESC`,
    `SELECT j.id FROM procurement_summary s JOIN juristic j ON j.id = s.winner_id WHERE ${stale} ORDER BY s.total_value DESC`,
    `SELECT j.id FROM juristic j WHERE ${stale} AND j.dissolved_date IS NULL ORDER BY j.dbd_fetched_at IS NOT NULL, j.dbd_fetched_at, j.register_date`,
  ];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const sql of tiers) {
    if (ids.length >= limit) break;
    const [rows] = await pool.query<import("mysql2").RowDataPacket[]>(`${sql} LIMIT ${limit * 2}`);
    for (const r of rows) {
      if (ids.length >= limit) break;
      if (!seen.has(r.id)) (seen.add(r.id), ids.push(r.id as string));
    }
  }
  const { dbdRemaining } = await import("@/lib/dbd-quota");
  const quota = await dbdRemaining("job");
  if (ids.length > quota) {
    console.log(`  (โควตา DBD ของงานเบื้องหลังวันนี้เหลือ ${quota} ครั้ง — ทำเท่าที่โควตาเหลือ)`);
    ids.length = quota;
  }
  console.log(`▶ ตรวจกับ DBD ${ids.length.toLocaleString()} ราย ที่ ${rate} req/s (~${Math.ceil(ids.length / rate / 60)} นาที)`);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let changed = 0;
  let same = 0;
  let notFound = 0;
  let errors = 0;
  let consecutive = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const t0 = Date.now();
    try {
      const raw = await fetchDbdJuristic(id);
      if (raw) {
        const p = normalizeProfile(raw);
        const [[before]] = await pool.query<import("mysql2").RowDataPacket[]>(
          `SELECT name_th, register_capital FROM juristic WHERE id = ?`,
          [id],
        );
        await upsertDbdProfile(p);
        if (before && (before.name_th !== p.nameTh || Number(before.register_capital) !== p.registerCapital)) {
          changed++;
          if (before.name_th !== p.nameTh) console.log(`  ✎ ${id}: ${before.name_th} → ${p.nameTh}`);
        } else same++;
      } else {
        await pool.query(`UPDATE juristic SET dbd_fetched_at = NOW() WHERE id = ?`, [id]);
        notFound++;
      }
      consecutive = 0;
    } catch (err) {
      if ((err as Error).name === "DbdQuotaError") {
        console.warn(`■ ${(err as Error).message} — หยุดรอบนี้ (ทำต่อพรุ่งนี้)`);
        break;
      }
      errors++;
      consecutive++;
      console.warn(`  ! ${id}: ${(err as Error).message}`);
      if (consecutive >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`✖ ผิดพลาดติดกัน ${consecutive} ครั้ง (อาจโดน WAF) — หยุดรอบนี้ รอบหน้าทำต่อ`);
        break;
      }
      await sleep(ERROR_PAUSE_MS);
    }
    if ((i + 1) % 100 === 0) console.log(`  … ${i + 1}/${ids.length} — เปลี่ยน ${changed} เหมือนเดิม ${same} ไม่พบ ${notFound} ผิดพลาด ${errors}`);
    const wait = 1000 / rate - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
  }

  const [[left]] = await pool.query<import("mysql2").RowDataPacket[]>(
    `SELECT COUNT(*) n FROM juristic j WHERE ${stale} AND j.dissolved_date IS NULL`,
  );
  console.log(
    `✔ เสร็จ — ข้อมูลเปลี่ยน ${changed} | เหมือนเดิม ${same} | ไม่พบ ${notFound} | ผิดพลาด ${errors} | ยังรอตรวจ ${Number(left.n).toLocaleString()} ราย`,
  );
  await closePool();
}

main().catch((err) => {
  console.error("✖ refresh failed:", err);
  process.exit(1);
});
