/**
 * MySQL / MariaDB connection pool — ใช้ร่วมกันระหว่างเว็บและสคริปต์ sync
 *
 * ตั้งค่าใน .env.local (หรือ Environment Variables ของ Plesk):
 *   DB_HOST=14.207.142.11      # ถ้า Next.js รันบนเครื่องเดียวกับ DB ใช้ localhost
 *   DB_PORT=3306
 *   DB_NAME=tipose_thaidatacorp
 *   DB_USER=tipose_thaidatacorp
 *   DB_PASSWORD="..."          # ใส่ในเครื่องหมายคำพูดถ้ามีอักขระพิเศษ เช่น * ? #
 */
import mysql, { type Pool, type QueryResult } from "mysql2/promise";

export function isDbConfigured(): boolean {
  return Boolean(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER);
}

// เก็บ pool ไว้ที่ globalThis กัน dev server (HMR) สร้าง connection ใหม่ทุกครั้งที่แก้โค้ด
const globalForDb = globalThis as unknown as { __tdcPool?: Pool };

export function getPool(): Pool {
  if (!isDbConfigured()) throw new Error("Database is not configured (DB_HOST / DB_NAME / DB_USER)");
  globalForDb.__tdcPool ??= mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    charset: "utf8mb4",
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
    // DATE → "YYYY-MM-DD" (ไม่แปลงเป็น Date ที่โดน timezone เลื่อนวัน), DECIMAL → number
    dateStrings: true,
    decimalNumbers: true,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    // DB อยู่คนละเครื่อง: firewall/MariaDB (wait_timeout) ตัด connection ที่ว่างนาน → ECONNRESET
    // จึงปิด connection ที่ว่างเกิน 30 วินาทีเอง ก่อนจะถูกตัดจากอีกฝั่ง
    maxIdle: 2,
    idleTimeout: 30_000,
  });
  return globalForDb.__tdcPool;
}

const RETRYABLE = new Set(["ECONNRESET", "PROTOCOL_CONNECTION_LOST", "EPIPE", "ETIMEDOUT", "ECONNREFUSED"]);

/** query พร้อมลองใหม่ 1 ครั้ง เมื่อได้ connection ที่ตายแล้วจาก pool */
export async function dbQuery<T extends QueryResult>(sql: string, params?: unknown[]): Promise<T> {
  try {
    const [rows] = await getPool().query<T>(sql, params);
    return rows;
  } catch (err) {
    if (!RETRYABLE.has((err as { code?: string }).code ?? "")) throw err;
    const [rows] = await getPool().query<T>(sql, params);
    return rows;
  }
}

export async function closePool(): Promise<void> {
  await globalForDb.__tdcPool?.end();
  globalForDb.__tdcPool = undefined;
}
