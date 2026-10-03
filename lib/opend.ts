/**
 * Open-D (opend.data.go.th) — ดึงข้อมูลเปิดของกรมพัฒนาธุรกิจการค้าจาก API โดยตรง
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * การตั้งค่า (.env.local)
 *
 *   OPEND_API_KEY=<USER TOKEN จากหน้า "สถิติการใช้งาน" ของ opend.data.go.th>
 *
 * Token ส่งผ่าน HTTP header ชื่อ "api-key" (ดู lib/ckan.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ชุดข้อมูลที่ใช้ (แยก resource รายเดือน ตั้งแต่ ม.ค. 2565):
 *   - dataset_11_0121  นิติบุคคลจดทะเบียนตั้งใหม่   → ข้อมูลหลักของนิติบุคคล
 *   - dataset_11_0219  นิติบุคคลจดทะเบียนเลิกกิจการ → ใช้ตรวจสถานะ "เลิก"
 *
 * ไฟล์นี้ใช้เมื่อยังไม่ได้ตั้งค่า DB เท่านั้น — เมื่อมี DB เว็บจะอ่านจาก DB
 * (ข้อมูลที่ sync ด้วย `npm run sync`) ซึ่งเร็วกว่าและไม่ต้องยิง API หลายสิบครั้งต่อหน้า
 *
 * ข้อจำกัด: มีเฉพาะนิติบุคคลที่ตั้งใหม่/เลิกตั้งแต่ปี 2565
 * ไม่มีชื่อภาษาอังกฤษ กรรมการ ผู้ถือหุ้น หรืองบการเงิน
 */
import "server-only";
import { datastoreSearch, getMonthlyResources, opendConfig } from "@/lib/ckan";
import {
  mergeOpendRecords,
  normalizeOpendRecord,
  padJuristicId,
  registrationYearFromId,
  toJuristicProfile,
  type MonthlyResource,
} from "@/lib/opend-normalize";
import type { JuristicProfile, OpendJuristicRecord } from "@/types/company";

const CACHE = { revalidate: 86_400 };
/** จำนวน request พร้อมกันสูงสุด เวลาไล่ค้นหลาย resource */
const MAX_CONCURRENCY = 8;

export function isOpendEnabled(): boolean {
  return opendConfig().apiKey !== "";
}

/** map แบบจำกัดจำนวน request พร้อมกัน — กันโดน rate limit เวลาไล่ค้นหลายเดือน */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function findFirst(
  resources: MonthlyResource[],
  id: string,
): Promise<{ rec: OpendJuristicRecord; month: number | null } | null> {
  const results = await mapLimit(resources, MAX_CONCURRENCY, (r) =>
    datastoreSearch<OpendJuristicRecord>(r.id, { filters: { "เลขทะเบียน": Number(id) }, limit: 1 }, CACHE).then(
      (res) => (res.records[0] ? { rec: res.records[0], month: r.month } : null),
    ),
  );
  return results.find((r) => r !== null) ?? null;
}

/**
 * ค้นนิติบุคคลด้วยเลข 13 หลัก
 * - ชุดตั้งใหม่: ค้นเฉพาะ resource ของปีที่ระบุในเลขทะเบียน (≤ 12 request)
 * - ชุดเลิก:    ค้นเฉพาะ resource ตั้งแต่ปีที่จดทะเบียนเป็นต้นไป
 */
export async function getOpendProfile(id: string): Promise<JuristicProfile | null> {
  const { newDataset, dissolvedDataset } = opendConfig();
  const year = registrationYearFromId(id);
  const [newRes, dissolvedRes] = await Promise.all([
    getMonthlyResources(newDataset, CACHE),
    getMonthlyResources(dissolvedDataset, CACHE),
  ]);

  const [registration, dissolution] = await Promise.all([
    findFirst(newRes.filter((r) => r.yearBE === null || r.yearBE === year), id),
    findFirst(dissolvedRes.filter((r) => r.yearBE === null || year === null || r.yearBE >= year), id),
  ]);

  const merged = mergeOpendRecords(registration, dissolution);
  return merged ? toJuristicProfile(merged) : null;
}

/** ค้นด้วยชื่อ (full-text) ใน resource ตั้งใหม่ล่าสุด `months` เดือน */
export async function searchOpendByName(query: string, months = 12, perResource = 10): Promise<JuristicProfile[]> {
  const resources = (await getMonthlyResources(opendConfig().newDataset, CACHE)).slice(0, months);
  const results = await mapLimit(resources, MAX_CONCURRENCY, (r) =>
    datastoreSearch<OpendJuristicRecord>(r.id, { q: query, limit: perResource }, CACHE).then((res) =>
      res.records.map((rec) => ({ rec, month: r.month })),
    ),
  );

  const seen = new Set<string>();
  return results.flat().flatMap(({ rec, month }) => {
    const id = padJuristicId(rec["เลขทะเบียน"]);
    if (seen.has(id)) return [];
    seen.add(id);
    return [toJuristicProfile(normalizeOpendRecord(rec, { kind: "new", month }))];
  });
}

/** นิติบุคคลจดทะเบียนใหม่ล่าสุด (สำหรับหน้าแรก / internal linking) */
export async function listRecentOpend(limit = 20): Promise<JuristicProfile[]> {
  const [latest] = await getMonthlyResources(opendConfig().newDataset, CACHE);
  if (!latest) return [];
  const res = await datastoreSearch<OpendJuristicRecord>(latest.id, { sort: "วันที่จดทะเบียน desc", limit }, CACHE);
  return res.records.map((rec) => toJuristicProfile(normalizeOpendRecord(rec, { kind: "new", month: latest.month })));
}

/** เลขทะเบียนจาก resource ตั้งใหม่ล่าสุด `months` เดือน (สำหรับ sitemap) */
export async function listOpendIds(months = 6, max = 50_000): Promise<string[]> {
  const resources = (await getMonthlyResources(opendConfig().newDataset, CACHE)).slice(0, months);
  const ids: string[] = [];
  for (const r of resources) {
    const res = await datastoreSearch<Pick<OpendJuristicRecord, "เลขทะเบียน">>(
      r.id,
      { fields: "เลขทะเบียน", limit: 10_000 },
      CACHE,
    );
    for (const rec of res.records) {
      ids.push(padJuristicId(rec["เลขทะเบียน"]));
      if (ids.length >= max) return ids;
    }
  }
  return ids;
}

export const OPEND_DATASET_URLS = {
  newRegistration: `https://data.go.th/dataset/${opendConfig().newDataset}`,
  dissolved: `https://data.go.th/dataset/${opendConfig().dissolvedDataset}`,
};
