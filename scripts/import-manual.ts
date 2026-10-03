/**
 * นำเข้าข้อมูลกรรมการ / ผู้ถือหุ้น / งบการเงิน ที่ได้รับจากเจ้าของบริษัท
 *
 *   npm run import:manual                 # นำเข้าทุกไฟล์ใน data/manual/*.json
 *   npm run import:manual -- 0105559140065 # นำเข้าเฉพาะบริษัทนี้
 *
 * รูปแบบไฟล์: data/manual/<เลขทะเบียน>.json (ดู data/manual/_template.json)
 * - ถ้ายังไม่มีบริษัทในตาราง juristic จะดึงข้อมูลทะเบียนจาก DBD Open API ให้ก่อน
 * - ส่วนที่ระบุในไฟล์ (directors / shareholders / financials) จะ "แทนที่" ข้อมูลเดิมทั้งชุด
 *   ส่วนที่ไม่ระบุ (ไม่มี key) จะไม่ถูกแตะ
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

interface ManualCompany {
  id: string;
  /** ยืนยันว่าเจ้าของบริษัทยินยอมให้เผยแพร่ข้อมูล */
  consent: boolean;
  authorizedSignatory?: string;
  businessSize?: string;
  directors?: Array<{ name: string; position?: string }>;
  shareholders?: Array<{ name: string; nationality?: string; shares: number; percent?: number }>;
  /** fiscalYear เป็นปี ค.ศ. (2025) หรือ พ.ศ. (2568) ก็ได้ */
  financials?: Array<{
    fiscalYear: number;
    totalRevenue: number;
    netProfit: number;
    totalAssets: number;
    totalLiabilities?: number;
    equity?: number;
  }>;
}

/** ตัดเครื่องหมาย "/" ท้ายข้อความที่ติดมาจากหน้า DBD และช่องว่างซ้ำ */
const tidy = (s: string) => s.replace(/\/+\s*$/, "").replace(/\s+/g, " ").trim();

async function main() {
  const { getPool, closePool } = await import("@/lib/db");
  const { fetchDbdJuristic } = await import("@/lib/dbd-openapi");
  const { normalizeProfile } = await import("@/lib/dbd-normalize");
  const { isValidJuristicId } = await import("@/lib/juristic-id");
  const { upsertDbdProfile } = await import("@/lib/juristic-write");

  const dir = path.join(process.cwd(), "data", "manual");
  const only = process.argv.slice(2).filter((a) => /^\d{13}$/.test(a));
  const files = readdirSync(dir).filter((f) => /^\d{13}\.json$/.test(f) && (only.length === 0 || only.includes(f.slice(0, 13))));
  if (files.length === 0) console.log("ไม่พบไฟล์ใน data/manual/");

  const pool = getPool();
  for (const file of files) {
    const c = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as ManualCompany;
    if (c.id !== file.slice(0, 13) || !isValidJuristicId(c.id)) throw new Error(`${file}: id ไม่ตรงกับชื่อไฟล์หรือไม่ถูกต้อง`);
    if (c.consent !== true) {
      console.log(`- ข้าม ${c.id}: ยังไม่ได้ระบุ "consent": true`);
      continue;
    }

    const [exists] = await pool.query<import("mysql2").RowDataPacket[]>(`SELECT id FROM juristic WHERE id = ?`, [c.id]);
    if (!exists[0]) {
      const raw = await fetchDbdJuristic(c.id);
      if (!raw) throw new Error(`${c.id}: ไม่พบใน DBD Open API`);
      await upsertDbdProfile(normalizeProfile(raw));
      console.log(`  + ดึงข้อมูลทะเบียน ${c.id} จาก DBD Open API`);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (c.authorizedSignatory !== undefined || c.businessSize !== undefined) {
        await conn.query(
          `UPDATE juristic SET authorized_signatory = COALESCE(?, authorized_signatory),
             business_size = COALESCE(?, business_size) WHERE id = ?`,
          [c.authorizedSignatory ? tidy(c.authorizedSignatory) : null, c.businessSize ?? null, c.id],
        );
      }
      if (c.directors) {
        await conn.query(`DELETE FROM juristic_director WHERE juristic_id = ?`, [c.id]);
        if (c.directors.length) {
          await conn.query(`INSERT INTO juristic_director (juristic_id, seq, name, position) VALUES ?`, [
            c.directors.map((d, i) => [c.id, i + 1, tidy(d.name), d.position ? tidy(d.position) : null]),
          ]);
        }
      }
      if (c.shareholders) {
        const total = c.shareholders.reduce((s, x) => s + x.shares, 0);
        await conn.query(`DELETE FROM juristic_shareholder WHERE juristic_id = ?`, [c.id]);
        if (c.shareholders.length) {
          await conn.query(`INSERT INTO juristic_shareholder (juristic_id, seq, name, nationality, shares, percent) VALUES ?`, [
            c.shareholders.map((s, i) => [
              c.id, i + 1, tidy(s.name), s.nationality ?? null, s.shares,
              s.percent ?? (total > 0 ? (s.shares / total) * 100 : 0),
            ]),
          ]);
        }
      }
      if (c.financials) {
        await conn.query(`DELETE FROM juristic_financial WHERE juristic_id = ?`, [c.id]);
        if (c.financials.length) {
          await conn.query(
            `INSERT INTO juristic_financial (juristic_id, fiscal_year, total_revenue, net_profit, total_assets,
               total_liabilities, equity) VALUES ?`,
            [
              c.financials.map((f) => [
                c.id, f.fiscalYear > 2400 ? f.fiscalYear - 543 : f.fiscalYear, f.totalRevenue, f.netProfit,
                f.totalAssets, f.totalLiabilities ?? null, f.equity ?? null,
              ]),
            ],
          );
        }
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    console.log(
      `✓ ${c.id} — กรรมการ ${c.directors?.length ?? "-"} | ผู้ถือหุ้น ${c.shareholders?.length ?? "-"} | ` +
        `งบการเงิน ${c.financials?.length ?? "-"} ปี`,
    );
  }
  await closePool();
}

main().catch((err) => {
  console.error("✖ import failed:", err);
  process.exit(1);
});
