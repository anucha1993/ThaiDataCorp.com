/**
 * ตั้งรหัสผ่านให้สมาชิกจากฝั่งเซิร์ฟเวอร์ — ใช้กับบัญชีผู้ดูแลครั้งแรก หรือเมื่อเข้าหน้า /admin ไม่ได้
 *
 *   npm run user:password -- someone@example.com                # สุ่มรหัสใหม่แล้วพิมพ์ออกมา
 *   npm run user:password -- someone@example.com 'NewPass123'   # กำหนดรหัสเอง
 *
 * ถ้ายังไม่มีบัญชีอีเมลนี้ จะสร้างให้ · ทุก session เดิมของบัญชีนี้จะถูกออกจากระบบ
 */
import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { dbQuery, closePool } = await import("@/lib/db");
  const { hashPassword, passwordProblem } = await import("@/lib/password");
  const [, , rawEmail, given] = process.argv;
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) throw new Error("ใช้: npm run user:password -- <email> [password]");
  const password = given ?? randomBytes(9).toString("base64url");
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem === "short" ? "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" : "รหัสผ่านยาวเกินไป");

  await dbQuery(
    `INSERT INTO app_user (email, password_hash, password_set_at) VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), password_set_at = NOW(), failed_logins = 0`,
    [email, await hashPassword(password)],
  );
  await dbQuery(`DELETE s FROM user_session s JOIN app_user u ON u.id = s.user_id WHERE u.email = ?`, [email]);
  console.log(`✓ ตั้งรหัสผ่านให้ ${email} แล้ว${given ? "" : `\n  รหัสผ่าน: ${password}\n  (เข้าสู่ระบบแล้วเปลี่ยนรหัสได้ที่หน้า "บัญชีของฉัน")`}`);
  await closePool();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
