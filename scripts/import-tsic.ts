/**
 * นำเข้ารหัส TSIC 2552 (ฉบับปรับปรุงโดยสำนักงานสถิติแห่งชาติ) → ตาราง tsic
 *
 *   npm run import:tsic
 *
 * ไฟล์ต้นทาง: data/reference/tsic-2552.xlsx
 *   ดาวน์โหลดจาก https://data.go.th/dataset/0210_12_0004
 *   ("โครงสร้างมาตรฐานการจัดจำแนกข้อมูลสถิติ เรื่อง TSIC NSO Revised Version 2009", CC-BY)
 *   ถ้า NSO ออกฉบับใหม่ ให้ดาวน์โหลดผ่านเบราว์เซอร์มาแทนไฟล์เดิม แล้วรันคำสั่งนี้ซ้ำ
 *
 * โครงสร้างชีต: คอลัมน์ A = "หมวดใหญ่ X" หรือหมวดย่อย 2 หลัก, B = หมู่ใหญ่ 3 หลัก,
 *               C = หมู่ย่อย 4 หลัก, D = กิจกรรม 5 หลัก, E = คำอธิบาย
 */
import path from "node:path";
import ExcelJS from "exceljs";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getPool, closePool } = await import("@/lib/db");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(process.cwd(), "data", "reference", "tsic-2552.xlsx"));
  const ws = wb.worksheets[0];

  const rows: Array<[string, number, string, string, string | null]> = [];
  let section = "";
  const lastAt: Record<number, string> = {};

  ws.eachRow((row) => {
    const v = (c: number) => String(row.getCell(c).value ?? "").trim();
    const name = v(5).replace(/\s+/g, " ");
    if (!name) return;

    const sec = v(1).match(/^หมวดใหญ่\s*([A-Z])$/);
    if (sec) {
      section = sec[1];
      lastAt[1] = section;
      rows.push([section, 1, name, section, null]);
      return;
    }
    // ตัวเลขบางช่องเป็น numeric จนเลข 0 นำหน้าหาย → เติมกลับตามความยาวของระดับ
    // บางแถวมีหลายระดับในแถวเดียว (เช่น 0114 + 01140 "การปลูกอ้อย") → เก็บทุกระดับที่มี
    for (const [col, len] of [[1, 2], [2, 3], [3, 4], [4, 5]] as const) {
      const raw = v(col);
      if (!/^\d+$/.test(raw)) continue;
      const code = raw.padStart(len, "0");
      const level = len; // 2..5
      const parent = level === 2 ? section : lastAt[level - 1];
      lastAt[level] = code;
      rows.push([code, level, name, section, parent]);
    }
  });

  const byLevel = rows.reduce<Record<number, number>>((a, r) => ((a[r[1]] = (a[r[1]] ?? 0) + 1), a), {});
  console.log("parsed:", byLevel);
  if ((byLevel[5] ?? 0) < 1000) throw new Error("จำนวนรหัส 5 หลักน้อยผิดปกติ — โครงสร้างไฟล์อาจเปลี่ยน");

  const pool = getPool();
  await pool.query(
    `INSERT INTO tsic (code, level, name_th, section, parent_code) VALUES ?
     ON DUPLICATE KEY UPDATE level = VALUES(level), name_th = VALUES(name_th),
       section = VALUES(section), parent_code = VALUES(parent_code)`,
    [rows],
  );
  // รหัสที่ DBD ใช้แต่ไม่มีใน TSIC 2552 ของ NSO (DBD เพิ่มเอง เช่น 49323, 77409)
  // → ขอชื่อทางการจาก DBD Open API ผ่านบริษัทตัวอย่างที่ใช้รหัสนั้น (รหัสละไม่เกิน 3 ราย, ยิงทีละ 1 วินาที)
  const { fetchDbdJuristic } = await import("@/lib/dbd-openapi");
  const [missing] = await pool.query<import("mysql2").RowDataPacket[]>(
    `SELECT j.tsic_code AS code, SUBSTRING_INDEX(GROUP_CONCAT(j.id ORDER BY j.register_date DESC), ',', 3) AS ids
     FROM juristic j LEFT JOIN tsic t ON t.code = j.tsic_code
     WHERE j.tsic_code IS NOT NULL AND t.code IS NULL GROUP BY j.tsic_code`,
  );
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (const m of missing) {
    let name: string | undefined;
    for (const id of String(m.ids).split(",")) {
      await sleep(1000);
      const raw = await fetchDbdJuristic(id).catch(() => null);
      const obj = raw?.["cd:OrganizationJuristicObjective"]?.["td:JuristicObjective"];
      if (obj && obj["td:JuristicObjectiveCode"] === m.code && obj["td:JuristicObjectiveTextTH"]) {
        name = obj["td:JuristicObjectiveTextTH"].replace(/\s+/g, " ").trim();
        break;
      }
    }
    const parent4 = String(m.code).slice(0, 4);
    const [[p]] = await pool.query<import("mysql2").RowDataPacket[]>(
      `SELECT code, section, name_th FROM tsic WHERE code IN (?, ?, ?) ORDER BY level DESC LIMIT 1`,
      [parent4, parent4.slice(0, 3), parent4.slice(0, 2)],
    );
    if (!p) {
      console.log(`  ? ${m.code}: ไม่พบหมวดแม่ ข้าม`);
      continue;
    }
    await pool.query(
      `INSERT INTO tsic (code, level, name_th, section, parent_code) VALUES (?, 5, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name_th = VALUES(name_th)`,
      [m.code, name ?? `${p.name_th} (รหัส ${m.code})`, p.section, p.code],
    );
    console.log(`  + ${m.code} ${name ? "← DBD" : "← ใช้ชื่อหมวดแม่"}: ${(name ?? p.name_th).slice(0, 60)}`);
  }

  const [[m]] = await pool.query<import("mysql2").RowDataPacket[]>(
    `SELECT COUNT(DISTINCT j.tsic_code) used, SUM(t.code IS NULL) unmatched_rows
     FROM juristic j LEFT JOIN tsic t ON t.code = j.tsic_code WHERE j.tsic_code IS NOT NULL`,
  );
  console.log(`✓ tsic ${rows.length} rows — รหัสที่ใช้ใน juristic ${m.used}, แถวที่หารหัสไม่เจอ ${m.unmatched_rows}`);
  await closePool();
}

main().catch((err) => {
  console.error("✖ import tsic failed:", err);
  process.exit(1);
});
