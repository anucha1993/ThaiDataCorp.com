/**
 * Sync สัญญาจัดซื้อจัดจ้างภาครัฐ (e-GP) จาก data.go.th → MySQL
 *
 *   npm run sync:egp          # sync เฉพาะ resource ที่ใหม่/ถูกแก้ไข
 *   npm run sync:egp -- --full
 *   npm run sync:egp -- --summaries-only   # สร้างตารางสรุปใหม่อย่างเดียว (ไม่ดึงข้อมูล)
 *
 * แหล่งข้อมูล: "ข้อมูลโครงการจัดซื้อจัดจ้างจากระบบการจัดซื้อจัดจ้างภาครัฐ" (สพร., CC-BY)
 *   ค่าเริ่มต้น: egp-contact-2568 — ตั้งชุดอื่นได้ด้วย EGP_DATASETS=egp-contact-2568,xxx
 *
 * ปัญหาของข้อมูลต้นทางที่จัดการในสคริปต์นี้:
 *   - ปี 2568: หัวตารางมีคอลัมน์ภาษาอังกฤษ 3 คอลัมน์ที่ข้อมูลจริงไม่มี → ค่าเลื่อนไป 3 ช่อง
 *     จึงอ่านตามตำแหน่ง และตรวจรูปแบบทีละแถวว่าเลื่อนหรือไม่
 *   - ปี 2567 และก่อนหน้า: เลขนิติบุคคลถูก Excel แปลงเป็น "1.0554E+11" (ข้อมูลสูญหาย) → ยังไม่ sync
 *   - ผู้ชนะที่เป็นบุคคลธรรมดาถูกปิดเลข 4 หลักท้าย ("xxxx") → ไม่เก็บ (เก็บเฉพาะนิติบุคคล)
 *   - วันที่เป็น พ.ศ. แบบย่อ: "21 ก.ค. 68" หรือ "17-มิ.ย.-67"
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const PAGE_SIZE = 10_000;
const BATCH_SIZE = 2_000;
const RESOURCE_CONCURRENCY = 3;

/** ลำดับค่าจริงในแถว เมื่อไม่มีคอลัมน์ภาษาอังกฤษ (ข้อมูลเลื่อน) */
const SHIFTED = [
  "seq", "projectId", "projectName", "projectType", "agency", "subAgency", "method", "methodGroup",
  "announceDate", "budget", "refPrice", "agreedPrice", "fiscalYear", "txDate", "province", "district",
  "subdistrict", "projectStatus", "point", "lat", "lon", "winnerId", "winnerName", "contractNo",
  "signDate", "endDate", "contractValue", "contractStatus",
] as const;
/** ลำดับตามหัวตาราง (มีคอลัมน์ภาษาอังกฤษ) */
const NORMAL = [
  "seq", "projectId", "projectName", "projectType", "agency", "subAgency", "method", "methodGroup",
  "announceDate", "budget", "refPrice", "agreedPrice", "fiscalYear", "txDate", "province", "provinceEn",
  "district", "districtEn", "subdistrict", "subdistrictEn", "projectStatus", "point", "lat", "lon",
  "winnerId", "winnerName", "contractNo", "signDate", "endDate", "contractValue", "contractStatus",
] as const;
type Key = (typeof NORMAL)[number] | (typeof SHIFTED)[number];

const TH_MONTH: Record<string, number> = {
  "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
  "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
};

/** "21 ก.ค. 68" / "17-มิ.ย.-67" / "21 ก.ค. 2568" → "2025-07-21" */
function parseThaiShortDate(raw: unknown): string | null {
  const m = String(raw ?? "").trim().match(/^(\d{1,2})[\s-]+([ก-๙.]+)[\s-]+(\d{2,4})$/);
  if (!m) return null;
  const month = TH_MONTH[m[2]];
  if (!month) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2500;
  year -= 543;
  const d = Number(m[1]);
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return check.getUTCDate() === d ? iso : null;
}

function num(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function text(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  return s && s !== "-" && s !== "null" ? s.slice(0, max) : null;
}

const GENERIC_METHOD = /^วิธีการจัดหา/;

async function main() {
  const full = process.argv.includes("--full");
  const { getPool, closePool, isDbConfigured } = await import("@/lib/db");
  const { ckan, datastoreSearch } = await import("@/lib/ckan");
  const { isValidJuristicId } = await import("@/lib/juristic-id");
  type Pkg = import("@/types/company").CkanPackage;

  if (!isDbConfigured()) throw new Error("ยังไม่ได้ตั้งค่า DB ใน .env.local");
  const pool = getPool();
  const datasets = (process.env.EGP_DATASETS ?? "egp-contact-2568").split(",").map((s) => s.trim()).filter(Boolean);
  const started = Date.now();
  let kept = 0;
  let skipped = 0;

  function toRow(rec: Record<string, unknown>, fieldIds: string[]): unknown[] | null {
    const values = fieldIds.map((f) => rec[f]);
    // ข้อมูลเลื่อนเมื่อตำแหน่งเลขนิติบุคคลแบบ "ไม่มีคอลัมน์อังกฤษ" เป็นเลข 13 หลัก/เลขที่ถูกปิด
    const shiftedIdx = SHIFTED.indexOf("winnerId");
    const isShifted = /^\d{9,13}$|x{4}$/i.test(String(values[shiftedIdx] ?? "").trim());
    const order: readonly Key[] = isShifted ? SHIFTED : NORMAL;
    const v = (k: Key) => values[order.indexOf(k as never)];

    const winnerId = String(v("winnerId") ?? "").trim().padStart(13, "0");
    if (!/^0\d{12}$/.test(winnerId) || !isValidJuristicId(winnerId)) return null; // บุคคลธรรมดา/เลขเสีย
    const seq = num(v("seq"));
    const fiscalYear = num(v("fiscalYear"));
    const projectName = text(v("projectName"), 500);
    if (seq === null || fiscalYear === null || !projectName) return null;

    const method = [text(v("method"), 128), text(v("methodGroup"), 128)].find((m) => m && !GENERIC_METHOD.test(m)) ?? null;
    const lat = num(v("lat"));
    const lon = num(v("lon"));
    const okCoord = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

    return [
      fiscalYear, seq, num(v("projectId")), projectName, text(v("projectType"), 64), text(v("agency"), 255),
      text(v("subAgency"), 255), method, num(v("budget")), num(v("refPrice")), num(v("agreedPrice")),
      text(v("province"), 64), text(v("district"), 128), text(v("projectStatus"), 64),
      okCoord ? lat : null, okCoord ? lon : null, winnerId, text(v("winnerName"), 255), text(v("contractNo"), 128),
      parseThaiShortDate(v("signDate")), parseThaiShortDate(v("endDate")), num(v("contractValue")),
      text(v("contractStatus"), 64),
    ];
  }

  const INSERT = `INSERT INTO procurement_contract (fiscal_year, seq, project_id, project_name, project_type, agency,
      sub_agency, method, budget, ref_price, agreed_price, province, district, project_status, lat, lon, winner_id,
      winner_name, contract_no, sign_date, end_date, contract_value, contract_status) VALUES ?
    ON DUPLICATE KEY UPDATE project_name = VALUES(project_name), project_status = VALUES(project_status),
      contract_value = VALUES(contract_value), contract_status = VALUES(contract_status), end_date = VALUES(end_date)`;

  async function syncResource(dataset: string, r: { id: string; name: string; modified: string | null }) {
    const [state] = await pool.query<import("mysql2").RowDataPacket[]>(
      `SELECT source_modified FROM sync_resource WHERE resource_id = ?`,
      [r.id],
    );
    if (!full && r.modified && state[0]?.source_modified === r.modified) return;

    const t0 = Date.now();
    let rows = 0;
    let resourceKept = 0;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await datastoreSearch<Record<string, unknown>>(r.id, { limit: PAGE_SIZE, offset }, { retries: 5 });
      const fieldIds = ((page as unknown as { fields?: Array<{ id: string }> }).fields ?? [])
        .map((f) => f.id)
        .filter((f) => f !== "_id");
      const values = page.records.map((rec) => toRow(rec, fieldIds)).filter((x): x is unknown[] => x !== null);
      for (let i = 0; i < values.length; i += BATCH_SIZE) await pool.query(INSERT, [values.slice(i, i + BATCH_SIZE)]);
      rows += page.records.length;
      resourceKept += values.length;
      if (page.records.length < PAGE_SIZE) break;
    }
    kept += resourceKept;
    skipped += rows - resourceKept;
    await pool.query(
      `INSERT INTO sync_resource (resource_id, dataset, name, source_modified, row_count, synced_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE source_modified = VALUES(source_modified), row_count = VALUES(row_count), synced_at = NOW()`,
      [r.id, dataset, r.name, r.modified, resourceKept],
    );
    console.log(
      `  ✓ ${r.name} — ${rows.toLocaleString()} แถว, เก็บ ${resourceKept.toLocaleString()} (นิติบุคคล) ` +
        `(${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    );
  }

  for (const dataset of process.argv.includes("--summaries-only") ? [] : datasets) {
    const pkg = await ckan<Pkg>("package_show", { id: dataset }, { retries: 4 });
    const resources = pkg.resources
      .filter((r) => r.datastore_active)
      .map((r) => ({ id: r.id, name: r.name, modified: r.last_modified ?? r.metadata_modified ?? null }));
    console.log(`▶ ${dataset} — ${resources.length} resources${full ? " [full]" : ""}`);
    // ทำทีละ RESOURCE_CONCURRENCY resource พร้อมกัน (สุภาพกับ server ของ data.go.th)
    for (let i = 0; i < resources.length; i += RESOURCE_CONCURRENCY) {
      await Promise.all(resources.slice(i, i + RESOURCE_CONCURRENCY).map((r) => syncResource(dataset, r)));
    }
  }

  await buildSummaries(pool);
  const [[s]] = await pool.query<import("mysql2").RowDataPacket[]>(
    `SELECT COUNT(*) companies, SUM(contracts) contracts, SUM(total_value) value FROM procurement_summary`,
  );
  console.log(
    `✔ เสร็จใน ${((Date.now() - started) / 60000).toFixed(1)} นาที — เก็บ ${kept.toLocaleString()} สัญญา ` +
      `(ข้าม ${skipped.toLocaleString()} แถวที่ไม่ใช่นิติบุคคล) | บริษัทที่มีงานรัฐ ${Number(s.companies).toLocaleString()} ราย ` +
      `มูลค่ารวม ${Math.round(Number(s.value) / 1e6).toLocaleString()} ล้านบาท`,
  );
  await closePool();
}

/** ตารางสรุปสำหรับหน้าบริษัท / หน่วยงาน / จัดอันดับรายจังหวัด — สร้างใหม่ทั้งหมดทุกครั้ง */
async function buildSummaries(pool: import("mysql2/promise").Pool) {
  const VALUE = `COALESCE(contract_value, agreed_price, 0)`;
  const steps: Array<[string, string[]]> = [
    [
      "procurement_summary (ต่อบริษัท)",
      [
        `TRUNCATE TABLE procurement_summary`,
        `INSERT INTO procurement_summary (winner_id, winner_name, contracts, total_value, agencies, first_sign, last_sign)
         SELECT winner_id, MAX(winner_name), COUNT(*), COALESCE(SUM(${VALUE}), 0), COUNT(DISTINCT agency), MIN(sign_date), MAX(sign_date)
         FROM procurement_contract GROUP BY winner_id`,
      ],
    ],
    [
      "procurement_agency_summary (ต่อหน่วยงาน)",
      [
        `TRUNCATE TABLE procurement_agency_summary`,
        `INSERT INTO procurement_agency_summary (agency, contracts, total_value, winners, ebid_contracts, top_province)
         SELECT agency, COUNT(*), COALESCE(SUM(${VALUE}), 0), COUNT(DISTINCT winner_id),
           SUM(method LIKE '%e-bidding%' OR method LIKE '%ประกวดราคา%'), NULL
         FROM procurement_contract WHERE agency IS NOT NULL GROUP BY agency`,
        // จังหวัดที่หน่วยงานทำสัญญามากที่สุด
        `UPDATE procurement_agency_summary s JOIN (
           SELECT agency, province, ROW_NUMBER() OVER (PARTITION BY agency ORDER BY COUNT(*) DESC) rn
           FROM procurement_contract WHERE agency IS NOT NULL AND province IS NOT NULL GROUP BY agency, province
         ) t ON t.agency = s.agency AND t.rn = 1 SET s.top_province = t.province`,
      ],
    ],
    [
      "procurement_province_winner (จัดอันดับรายจังหวัด)",
      [
        `TRUNCATE TABLE procurement_province_winner`,
        `INSERT INTO procurement_province_winner (province, winner_id, contracts, total_value)
         SELECT province, winner_id, COUNT(*), COALESCE(SUM(${VALUE}), 0)
         FROM procurement_contract WHERE province IS NOT NULL GROUP BY province, winner_id`,
      ],
    ],
  ];
  for (const [label, sqls] of steps) {
    const t0 = Date.now();
    for (const sql of sqls) await pool.query(sql);
    console.log(`  ✓ ${label} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}

main().catch((err) => {
  console.error("✖ sync e-GP failed:", err);
  process.exit(1);
});
