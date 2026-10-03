/**
 * คัดลอกข้อมูลทั้งหมดจาก DB เดิม → DB ปัจจุบัน (DB_*) — ใช้ตอนย้ายเซิร์ฟเวอร์
 *
 *   1. npm run db:migrate                      # สร้างตารางใน DB ปลายทางก่อน
 *   2. ตั้งค่า DB ต้นทางใน .env.local:
 *        SRC_DB_HOST=14.207.142.11
 *        SRC_DB_NAME=...
 *        SRC_DB_USER=...
 *        SRC_DB_PASSWORD="..."
 *   3. npm run db:copy -- --dry-run            # ตรวจการเชื่อมต่อ + นับแถว ไม่เขียนอะไร
 *      npm run db:copy                         # คัดลอกจริง
 *
 * ตัวเลือก
 *   --tables=juristic,tsic   คัดลอกเฉพาะบางตาราง
 *
 * แถวที่มี primary key ซ้ำในปลายทางจะถูกข้าม (INSERT IGNORE) จึงรันซ้ำได้ถ้าหลุดกลางทาง
 * ยกเว้นตารางค่าตั้งต้น (plan, app_setting, job_schedule) ที่ db:migrate ใส่ค่าเริ่มต้นไว้ → เขียนทับด้วยค่าจาก DB เดิม
 */
import { loadEnvConfig } from "@next/env";
import type { Connection as CoreConnection } from "mysql2";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";

loadEnvConfig(process.cwd());

/** โทเค็นชั่วคราว (ลิงก์เข้าสู่ระบบ / OAuth) ไม่ต้องย้าย */
const SKIP = new Set(["auth_token", "oauth_pending"]);
/** ตารางที่ db:migrate ใส่ค่าตั้งต้นไว้ — ให้ค่าจาก DB เดิมชนะ */
const OVERWRITE = new Set(["plan", "app_setting", "job_schedule"]);
const BATCH = 500;

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const dryRun = process.argv.includes("--dry-run");

async function connect(prefix: "SRC_DB" | "DB"): Promise<Connection> {
  const env = (k: string) => process.env[`${prefix}_${k}`];
  if (!env("HOST") || !env("NAME") || !env("USER")) throw new Error(`ยังไม่ได้ตั้งค่า ${prefix}_HOST / ${prefix}_NAME / ${prefix}_USER`);
  const conn = await mysql.createConnection({
    host: env("HOST"),
    port: Number(env("PORT") ?? 3306),
    database: env("NAME"),
    user: env("USER"),
    password: env("PASSWORD"),
    charset: "utf8mb4",
    // ส่งค่าเป็นข้อความตรง ๆ ไม่ผ่าน Date/number ของ JS → วันที่และทศนิยมไม่เพี้ยน
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 15_000,
  });
  // ทั้งสองฝั่งใช้ timezone เดียวกัน → คอลัมน์ TIMESTAMP ย้ายได้ตรงค่า
  await conn.query("SET time_zone = '+00:00'");
  return conn;
}

async function tables(conn: Connection): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  return rows.map((r) => r.t as string);
}

async function columns(conn: Connection, table: string): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position",
    [table],
  );
  return rows.map((r) => r.c as string);
}

async function main() {
  const src = await connect("SRC_DB");
  const dst = await connect("DB");
  console.log(`ต้นทาง  ${process.env.SRC_DB_USER}@${process.env.SRC_DB_HOST}/${process.env.SRC_DB_NAME}`);
  console.log(`ปลายทาง ${process.env.DB_USER}@${process.env.DB_HOST}/${process.env.DB_NAME}${dryRun ? "  (dry-run)" : ""}\n`);

  const only = arg("tables")?.split(",");
  const dstTables = new Set(await tables(dst));
  if (dstTables.size === 0) throw new Error("DB ปลายทางยังไม่มีตาราง — รัน npm run db:migrate ก่อน");

  await dst.query("SET FOREIGN_KEY_CHECKS = 0, UNIQUE_CHECKS = 0");
  for (const table of await tables(src)) {
    if (SKIP.has(table) || (only && !only.includes(table))) continue;
    if (!dstTables.has(table)) {
      console.log(`- ${table}: ไม่มีในปลายทาง ข้าม`);
      continue;
    }
    const dstCols = new Set(await columns(dst, table));
    const cols = (await columns(src, table)).filter((c) => dstCols.has(c));
    const [[{ n }]] = await src.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${table}\``);
    if (dryRun || Number(n) === 0) {
      console.log(`- ${table}: ${Number(n).toLocaleString()} แถว`);
      continue;
    }

    const colList = cols.map((c) => `\`${c}\``).join(", ");
    const verb = OVERWRITE.has(table) ? "REPLACE" : "INSERT IGNORE";
    const flush = async (batch: unknown[][]) => {
      await dst.query(`${verb} INTO \`${table}\` (${colList}) VALUES ?`, [batch]);
    };

    const started = Date.now();
    let batch: unknown[][] = [];
    let done = 0;
    // stream ทีละแถว (ไม่โหลดทั้งตารางเข้าหน่วยความจำ) — for await จะหยุดอ่านระหว่างรอเขียน
    // stream() มีเฉพาะใน API แบบ callback → ใช้ connection ตัวในของ promise wrapper
    const core = (src as unknown as { connection: CoreConnection }).connection;
    const stream = core.query(`SELECT ${colList} FROM \`${table}\``).stream({ highWaterMark: BATCH * 2 });
    for await (const row of stream as AsyncIterable<Record<string, unknown>>) {
      batch.push(cols.map((c) => row[c]));
      if (batch.length >= BATCH) {
        await flush(batch);
        done += batch.length;
        batch = [];
        if (done % 50_000 === 0) process.stdout.write(`  ${table}: ${done.toLocaleString()} / ${Number(n).toLocaleString()}\r`);
      }
    }
    if (batch.length) await flush(batch);
    done += batch.length;
    console.log(`✓ ${table}: ${done.toLocaleString()} แถว (${Math.round((Date.now() - started) / 1000)} วินาที)          `);
  }

  await src.end();
  await dst.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
