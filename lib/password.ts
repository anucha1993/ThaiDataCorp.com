/**
 * แฮชรหัสผ่านด้วย scrypt (มีใน node:crypto ไม่ต้องลงแพ็กเกจเพิ่ม)
 * รูปแบบที่เก็บ: scrypt$N$r$p$salt$key (base64url) — ปรับค่า N ภายหลังได้โดยรหัสเดิมยังตรวจได้
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFC"), salt, KEYLEN, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** ข้อความแจ้งเมื่อรหัสผ่านใช้ไม่ได้ — null = ใช้ได้ */
export function passwordProblem(password: string): "short" | "long" | null {
  if (password.length < PASSWORD_MIN) return "short";
  if (password.length > PASSWORD_MAX) return "long";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    // ไม่มีบัญชี/ไม่มีรหัสผ่าน: ยังคำนวณ 1 รอบ ให้ใช้เวลาเท่ากัน (เดาไม่ได้ว่าอีเมลไหนมีบัญชี)
    await derive(password, randomBytes(16), { N, r: R, p: P });
    return false;
  }
  const [, n, r, p, salt, key] = parts;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
