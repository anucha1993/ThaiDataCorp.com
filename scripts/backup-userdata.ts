/**
 * สำรองข้อมูลที่ "หาใหม่ไม่ได้" (ผู้ใช้สร้างเอง) — ข้อมูลภาครัฐ (juristic / procurement) sync ใหม่ได้จึงไม่รวม
 *
 *   npm run backup                 # สร้าง storage/backups/userdata-YYYY-MM-DD.sql.gz (เก็บ 14 วันล่าสุด)
 *   (งาน "สำรองข้อมูลผู้ใช้" ใน /admin/jobs รันทุกวัน 02:40)
 *
 * ถ้าตั้งค่า R2 จะอัปโหลดสำเนาไป R2 (backups/) ด้วย — มีสำเนานอกเซิร์ฟเวอร์ ถ้าเครื่องเสียก็ยังกู้ได้
 *
 * ไฟล์เป็นคำสั่ง INSERT IGNORE → กู้คืนด้วย npm run restore -- <ไฟล์> --yes
 * จะ "เติมเฉพาะแถวที่หายไป" ไม่เขียนทับข้อมูลที่มีอยู่
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export const USER_TABLES = [
  "app_user", "user_identity", "user_watch", "saved_search", "payment_order", "plan", "app_setting", "job_schedule",
  "support_request", "juristic_contact", "company_claim", "company_member", "company_profile", "job_post", "news_post",
  "page_view",
];
const KEEP_DAYS = 14;
const BATCH = 500;

async function main() {
  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, charset: "utf8mb4", dateStrings: true,
    supportBigNumbers: true, bigNumberStrings: true,
  });
  await conn.query("SET time_zone = '+00:00'"); // เวลา TIMESTAMP ตรงค่าเมื่อกู้คืน (ฝั่ง restore ตั้งเหมือนกัน)

  const dir = path.join(process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage"), "backups");
  await mkdir(dir, { recursive: true });
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const file = path.join(dir, `userdata-${day}.sql.gz`);
  const gz = createGzip();
  const out = createWriteStream(file);
  gz.pipe(out);
  const write = (s: string) => new Promise<void>((ok) => (gz.write(s) ? ok() : gz.once("drain", ok)));

  await write(`-- ThaiDataCorp user data backup ${new Date().toISOString()}\nSET time_zone = '+00:00';\nSET NAMES utf8mb4;\n`);
  let total = 0;
  for (const table of USER_TABLES) {
    const [exists] = await conn.query<import("mysql2").RowDataPacket[]>(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
      [table],
    );
    if (!exists.length) continue;
    let n = 0;
    let batch: string[] = [];
    let cols: string[] | null = null;
    const flush = async () => {
      if (!batch.length || !cols) return;
      await write(`INSERT IGNORE INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(",")}) VALUES\n${batch.join(",\n")};\n`);
      batch = [];
    };
    const core = (conn as unknown as { connection: import("mysql2").Connection }).connection;
    for await (const row of core.query(`SELECT * FROM \`${table}\``).stream() as AsyncIterable<Record<string, unknown>>) {
      cols ??= Object.keys(row);
      batch.push(`(${cols.map((c) => conn.escape(row[c])).join(",")})`);
      n++;
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    await write(`-- ${table}: ${n} rows\n`);
    console.log(`✓ ${table}: ${n.toLocaleString()} แถว`);
    total += n;
  }
  gz.end();
  await new Promise((ok) => out.on("finish", ok));
  await conn.end();

  // เก็บเฉพาะ 14 วันล่าสุด
  const old = (await readdir(dir)).filter((f) => /^userdata-\d{4}-\d{2}-\d{2}\.sql\.gz$/.test(f)).sort().slice(0, -KEEP_DAYS);
  for (const f of old) await unlink(path.join(dir, f));
  console.log(`สำรองแล้ว ${total.toLocaleString()} แถว → ${file}${old.length ? ` (ลบไฟล์เก่า ${old.length} ไฟล์)` : ""}`);

  // สำเนานอกเซิร์ฟเวอร์ (R2) — เก็บ 14 ไฟล์ล่าสุดเช่นกัน
  const { isR2Configured, r2Put, r2List, r2Delete } = await import("@/lib/r2");
  if (isR2Configured()) {
    const key = `backups/${path.basename(file)}`;
    await r2Put(key, await readFile(file), "application/gzip");
    const remote = (await r2List("backups/userdata-")).sort().slice(0, -KEEP_DAYS);
    for (const k of remote) await r2Delete(k);
    console.log(`อัปโหลดสำเนาไป R2 → ${key}${remote.length ? ` (ลบสำเนาเก่าใน R2 ${remote.length} ไฟล์)` : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
