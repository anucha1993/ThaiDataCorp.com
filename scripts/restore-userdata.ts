/**
 * กู้คืนข้อมูลผู้ใช้จากไฟล์สำรอง (scripts/backup-userdata.ts)
 *
 *   npm run restore -- storage/backups/userdata-2026-10-03.sql.gz            # ตรวจไฟล์อย่างเดียว ไม่เขียน
 *   npm run restore -- storage/backups/userdata-2026-10-03.sql.gz --yes      # กู้คืนจริง
 *   npm run restore -- <ไฟล์> --yes --tables=page_view                      # เฉพาะบางตาราง
 *   npm run restore -- r2:backups/userdata-2026-10-03.sql.gz --yes          # ดึงไฟล์จาก R2 (เซิร์ฟเวอร์เสีย/ไฟล์ในเครื่องหาย)
 *
 * ใช้ INSERT IGNORE: เติมเฉพาะแถวที่หายไป แถวที่มีอยู่แล้ว (primary key ซ้ำ) ไม่ถูกแก้ไข
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  let file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) throw new Error("ใช้: npm run restore -- <ไฟล์ .sql.gz | r2:backups/...> [--yes] [--tables=a,b]");
  if (file.startsWith("r2:")) {
    const { r2Get } = await import("@/lib/r2");
    const obj = await r2Get(file.slice(3));
    if (!obj) throw new Error(`ไม่พบ ${file} ใน R2`);
    const tmp = (await import("node:path")).join((await import("node:os")).tmpdir(), `tdc-restore-${Date.now()}.sql.gz`);
    await (await import("node:fs/promises")).writeFile(tmp, obj.body);
    console.log(`ดาวน์โหลดจาก R2 → ${tmp}`);
    file = tmp;
  }
  const apply = process.argv.includes("--yes");
  const only = process.argv.find((a) => a.startsWith("--tables="))?.split("=")[1]?.split(",");

  const mysql = (await import("mysql2/promise")).default;
  const conn = apply
    ? await mysql.createConnection({
        host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), database: process.env.DB_NAME,
        user: process.env.DB_USER, password: process.env.DB_PASSWORD, charset: "utf8mb4", multipleStatements: false,
      })
    : null;
  await conn?.query("SET time_zone = '+00:00'");

  const counts = new Map<string, { stmts: number; added: number }>();
  let stmt = "";
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!stmt && (line.startsWith("--") || line.startsWith("SET ") || !line.trim())) continue;
    stmt += (stmt ? "\n" : "") + line;
    if (!line.endsWith(";")) continue;
    const table = stmt.match(/^INSERT IGNORE INTO `(\w+)`/)?.[1];
    if (table && (!only || only.includes(table))) {
      const c = counts.get(table) ?? { stmts: 0, added: 0 };
      c.stmts++;
      if (conn) {
        const [r] = await conn.query<import("mysql2").ResultSetHeader>(stmt);
        c.added += r.affectedRows;
      }
      counts.set(table, c);
    }
    stmt = "";
  }
  for (const [t, c] of counts) console.log(`${apply ? "✓" : "-"} ${t}: ${c.stmts} ชุดคำสั่ง${apply ? ` · เติมแถวที่หาย ${c.added.toLocaleString()} แถว` : ""}`);
  if (!apply) console.log("\n(ตรวจไฟล์อย่างเดียว — เพิ่ม --yes เพื่อกู้คืนจริง)");
  await conn?.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
