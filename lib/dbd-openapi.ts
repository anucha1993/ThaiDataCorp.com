/**
 * DBD Open API — https://openapi.dbd.go.th (Open-DBD, สัญญาอนุญาต Open Data Common)
 *
 *   GET https://openapi.dbd.go.th/api/v1/juristic_person/{เลขทะเบียน 13 หลัก}
 *
 * ค้นได้ทุกนิติบุคคล (ไม่จำกัดปีจดทะเบียน) ไม่ต้องใช้ API key
 * ข้อมูล 8 รายการ: เลขทะเบียน สถานะ ประเภท ทุน ชื่อไทย/อังกฤษ ที่ตั้งสำนักงานใหญ่ วันจดทะเบียน วัตถุประสงค์
 * ไม่มีกรรมการ ผู้ถือหุ้น หรืองบการเงิน (ต้องขอผ่าน BDEX: https://bdex.dbd.go.th)
 *
 * ⚠ อยู่หลัง WAF (Incapsula) — ใช้แบบค้นทีละเลขเมื่อจำเป็น และเก็บผลลง DB เสมอ
 *   ห้ามไล่สุ่มเลขทะเบียน (enumerate) เพราะเสี่ยงโดนบล็อก IP และเป็นการใช้งานเกินควร
 *
 * ไฟล์นี้ไม่ import "server-only" เพื่อให้สคริปต์ backfill ใช้ได้ แต่ห้าม import จาก Client Component
 */
import type { DbdOpenApiResponse, DbdRawJuristicPerson } from "@/types/company";
import { dbdRemaining, markDbdBlocked, recordDbdCall, type DbdPurpose } from "@/lib/dbd-quota";

const REQUEST_TIMEOUT_MS = 15_000;

/** เกินโควตารายวันของ DBD (หรือระบบงดเรียกเองเพราะใกล้ครบโควตา) — รอเที่ยงคืน */
export class DbdQuotaError extends Error {
  constructor(message = "DBD Open API: เกินโควตารายวัน — ลองใหม่หลังเที่ยงคืน") {
    super(message);
    this.name = "DbdQuotaError";
  }
}

export class DbdOpenApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DbdOpenApiError";
  }
}

function baseUrl(): string {
  return (process.env.DBD_OPENAPI_BASE_URL ?? "https://openapi.dbd.go.th/api/v1").replace(/\/+$/, "");
}

/** ปิดได้ด้วย DBD_OPENAPI_ENABLED=false */
export function isDbdOpenApiEnabled(): boolean {
  return process.env.DBD_OPENAPI_ENABLED !== "false";
}

/**
 * ดึงข้อมูลนิติบุคคล 1 ราย — คืน null เมื่อ DBD ตอบว่าไม่พบข้อมูล (code 1004)
 * throw เมื่อเป็นข้อผิดพลาดชั่วคราว (network / WAF / 5xx) เพื่อไม่ให้หน้า 404 ถูก cache ผิด ๆ
 */
export async function fetchDbdJuristic(
  id: string,
  { revalidate, purpose = "job" }: { revalidate?: number; purpose?: DbdPurpose } = {},
): Promise<DbdRawJuristicPerson | null> {
  // นับโควตารายวัน — งดเรียกเมื่อครบส่วนของตัวเอง หรือ DBD ตอบเกินโควตาไปแล้ววันนี้
  if ((await dbdRemaining(purpose).catch(() => 1)) <= 0) throw new DbdQuotaError();
  await recordDbdCall(purpose).catch(() => {});
  const res = await fetch(`${baseUrl()}/juristic_person/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json", "User-Agent": "ThaiDataCorp/1.0 (+https://thaidatacorp.com)" },
    ...(revalidate !== undefined && { next: { revalidate } }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new DbdOpenApiError(`DBD Open API ${res.status} ${res.statusText}`, res.status);

  // API ส่ง Content-Type เป็น text/html แต่เนื้อหาเป็น JSON — ถ้าเป็นหน้า WAF จะ parse ไม่ผ่าน
  const text = await res.text();
  let body: DbdOpenApiResponse;
  try {
    body = JSON.parse(text) as DbdOpenApiResponse;
  } catch {
    throw new DbdOpenApiError(`DBD Open API returned non-JSON (WAF?): ${text.slice(0, 120)}`, res.status);
  }

  if (body.status?.code === "1004") return null;
  if (body.status?.code === "8888") {
    await markDbdBlocked().catch(() => {});
    throw new DbdQuotaError(`DBD Open API 8888: ${body.status?.description ?? "rate limit"}`);
  }
  if (body.status?.code !== "1000") {
    throw new DbdOpenApiError(`DBD Open API error ${body.status?.code}: ${body.status?.description}`);
  }
  return body.data?.[0]?.["cd:OrganizationJuristicPerson"] ?? null;
}
