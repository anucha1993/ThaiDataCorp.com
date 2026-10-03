/**
 * สร้าง/อัปเดตตารางตาม db/schema.sql
 *   npm run db:migrate
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getPool, closePool } = await import("@/lib/db");
  const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);

  const pool = getPool();
  for (const stmt of statements) {
    const name = stmt.match(/TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)/i)?.[1] ?? stmt.slice(0, 40);
    await pool.query(stmt);
    console.log(`✓ ${name}`);
  }
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
