/**
 * Sync ข้อมูลนิติบุคคลจาก Open-D (data.go.th) → MySQL
 *
 *   npm run sync         # sync เฉพาะ resource รายเดือนที่ใหม่หรือถูกแก้ไข
 *   npm run sync:full    # sync ทุก resource ใหม่ทั้งหมด
 *
 * ตั้ง Scheduled Task บน Plesk ให้รัน `npm run sync` วันละครั้ง (ดู README ในข้อความส่งมอบ)
 *
 * ลำดับการทำงาน:
 *   1. ชุด "ตั้งใหม่" (เก่า → ใหม่) — upsert ข้อมูลทะเบียน + วันจดทะเบียน
 *   2. ชุด "เลิก"   (เก่า → ใหม่) — ตั้งวันเลิก และอัปเดตชื่อ/ทุน/ที่อยู่เป็นข้อมูลล่าสุด
 * การ upsert ออกแบบให้ผลลัพธ์ถูกต้องไม่ว่าจะ sync resource ไหนก่อนหลัง
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const PAGE_SIZE = 10_000;
const BATCH_SIZE = 1_000;

type Kind = "new" | "dissolved";

async function main() {
  const full = process.argv.includes("--full");
  const { getPool, closePool, isDbConfigured } = await import("@/lib/db");
  const { datastoreSearch, getMonthlyResources, opendConfig } = await import("@/lib/ckan");
  const { normalizeOpendRecord } = await import("@/lib/opend-normalize");
  type Rec = import("@/types/company").OpendJuristicRecord;
  type Res = import("@/lib/opend-normalize").MonthlyResource;

  if (!isDbConfigured()) throw new Error("ยังไม่ได้ตั้งค่า DB_HOST / DB_NAME / DB_USER ใน .env.local");
  const pool = getPool();
  const cfg = opendConfig();
  const started = Date.now();
  let totalRows = 0;

  const upsertSql: Record<Kind, string> = {
    // ชุดตั้งใหม่: ถ้าเลิกไปแล้ว (มีข้อมูลชุดเลิก) อย่าเขียนทับชื่อ/ทุน/ที่อยู่ที่ใหม่กว่า
    new: `
      INSERT INTO juristic (id, name_th, name_raw, juristic_type, register_date, register_capital, tsic_code,
        objective, address_line, sub_district, district, province, post_code, new_resource_id)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        register_date    = VALUES(register_date),
        new_resource_id  = VALUES(new_resource_id),
        name_th          = IF(dissolved_date IS NULL, VALUES(name_th), name_th),
        name_raw         = IF(dissolved_date IS NULL, VALUES(name_raw), name_raw),
        juristic_type    = IF(dissolved_date IS NULL, VALUES(juristic_type), juristic_type),
        register_capital = IF(dissolved_date IS NULL, VALUES(register_capital), register_capital),
        tsic_code        = IF(dissolved_date IS NULL, VALUES(tsic_code), tsic_code),
        objective        = IF(dissolved_date IS NULL, VALUES(objective), objective),
        address_line     = IF(dissolved_date IS NULL, VALUES(address_line), address_line),
        sub_district     = IF(dissolved_date IS NULL, VALUES(sub_district), sub_district),
        district         = IF(dissolved_date IS NULL, VALUES(district), district),
        province         = IF(dissolved_date IS NULL, VALUES(province), province),
        post_code        = IF(dissolved_date IS NULL, VALUES(post_code), post_code)`,
    // ชุดเลิก: ข้อมูล ณ วันเลิกเป็นข้อมูลล่าสุด เขียนทับได้ทุกฟิลด์ ยกเว้นวันจดทะเบียน
    dissolved: `
      INSERT INTO juristic (id, name_th, name_raw, juristic_type, dissolved_date, register_capital, tsic_code,
        objective, address_line, sub_district, district, province, post_code, dissolved_resource_id)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        dissolved_date        = VALUES(dissolved_date),
        dissolved_resource_id = VALUES(dissolved_resource_id),
        status_text      = NULL,
        name_th          = VALUES(name_th),
        name_raw         = VALUES(name_raw),
        juristic_type    = VALUES(juristic_type),
        register_capital = VALUES(register_capital),
        tsic_code        = VALUES(tsic_code),
        objective        = VALUES(objective),
        address_line     = VALUES(address_line),
        sub_district     = VALUES(sub_district),
        district         = VALUES(district),
        province         = VALUES(province),
        post_code        = VALUES(post_code)`,
  };

  async function fetchAll(resourceId: string): Promise<Rec[]> {
    const rows: Rec[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await datastoreSearch<Rec>(resourceId, { limit: PAGE_SIZE, offset }, { retries: 4 });
      rows.push(...page.records);
      if (page.records.length < PAGE_SIZE) return rows;
    }
  }

  async function syncResource(kind: Kind, dataset: string, r: Res) {
    const [state] = await pool.query<import("mysql2").RowDataPacket[]>(
      `SELECT source_modified FROM sync_resource WHERE resource_id = ?`,
      [r.id],
    );
    // ข้ามเมื่อ sync แล้วและ CKAN ยืนยันว่าไม่มีการแก้ไข (ถ้า CKAN ไม่บอกเวลาแก้ไข ให้ sync ใหม่เสมอ)
    if (!full && r.modified && state[0]?.source_modified === r.modified) return;

    const t0 = Date.now();
    const records = await fetchAll(r.id);
    const values = records
      .filter((rec) => rec["เลขทะเบียน"] && rec["ชื่อนิติบุคคล"])
      .map((rec) => {
        const n = normalizeOpendRecord(rec, { kind, month: r.month });
        const date = kind === "new" ? n.registerDate : n.dissolvedDate;
        return [n.id, n.nameTh, n.nameRaw, n.type, date, n.registerCapital, n.tsicCode, n.objective,
          n.addressLine, n.subDistrict, n.district, n.province, n.postCode, r.id];
      });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        await conn.query(upsertSql[kind], [values.slice(i, i + BATCH_SIZE)]);
      }
      await conn.query(
        `INSERT INTO sync_resource (resource_id, dataset, name, year_be, month, source_modified, row_count, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE name = VALUES(name), source_modified = VALUES(source_modified),
           row_count = VALUES(row_count), synced_at = NOW()`,
        [r.id, dataset, r.name, r.yearBE, r.month, r.modified, values.length],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    totalRows += values.length;
    console.log(`  ✓ ${r.name} — ${values.length.toLocaleString()} rows (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  for (const [kind, dataset] of [["new", cfg.newDataset], ["dissolved", cfg.dissolvedDataset]] as const) {
    // เก่า → ใหม่ เพื่อให้ข้อมูลเดือนล่าสุดเขียนทับทีหลัง
    const resources = (await getMonthlyResources(dataset, { retries: 4 })).reverse();
    console.log(`▶ ${dataset} (${kind}) — ${resources.length} resources${full ? " [full]" : ""}`);
    for (const r of resources) await syncResource(kind, dataset, r);
  }

  const [[{ n }]] = await pool.query<import("mysql2").RowDataPacket[]>(`SELECT COUNT(*) AS n FROM juristic`);
  console.log(
    `✔ เสร็จใน ${((Date.now() - started) / 1000).toFixed(0)}s — upsert ${totalRows.toLocaleString()} rows, ` +
      `ในตารางมีทั้งหมด ${Number(n).toLocaleString()} นิติบุคคล`,
  );
  await closePool();
}

main().catch((err) => {
  console.error("✖ sync failed:", err);
  process.exit(1);
});
