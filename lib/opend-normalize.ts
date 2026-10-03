/**
 * ฟังก์ชันแปลงข้อมูล Open-D → Domain (ไม่มี I/O)
 * ใช้ร่วมกันระหว่างเว็บ (lib/opend.ts) และสคริปต์ sync (scripts/sync-opend.ts)
 * จึงห้าม import "server-only" ในไฟล์นี้
 */
import { composeAddress, stripAdminPrefix } from "@/lib/address";
import type { CkanResource, JuristicProfile, OpendJuristicRecord } from "@/types/company";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export interface MonthlyResource {
  id: string;
  name: string;
  /** ปี พ.ศ. ของข้อมูล (null = อ่านจากชื่อไม่ได้) */
  yearBE: number | null;
  month: number | null;
  /** เวลาแก้ไขล่าสุดตาม CKAN ใช้ตรวจว่าต้อง sync ใหม่หรือไม่ */
  modified: string | null;
}

/** แปลง resource ของ dataset เป็นรายเดือน เรียงจากเดือนล่าสุด → เก่าสุด */
export function toMonthlyResources(resources: CkanResource[]): MonthlyResource[] {
  return resources
    .filter((r) => r.datastore_active !== false)
    .map((r) => {
      const m = r.name.match(/เดือน\s*(\S+?)\s+(\d{4})/);
      // ชื่อ resource บางเดือนสะกด "กรกฏาคม" (ฏ) แทน "กรกฎาคม" (ฎ)
      const month = m ? THAI_MONTHS.indexOf(m[1].replace(/ฏ/g, "ฎ")) + 1 || null : null;
      return {
        id: r.id,
        name: r.name,
        yearBE: m ? Number(m[2]) : null,
        month,
        modified: r.last_modified ?? r.metadata_modified ?? null,
      };
    })
    .sort((a, b) => (b.yearBE ?? 0) * 100 + (b.month ?? 0) - ((a.yearBE ?? 0) * 100 + (a.month ?? 0)));
}

/** เลขทะเบียนใน datastore เป็น numeric (เลข 0 นำหน้าหาย) → 13 หลัก */
export function padJuristicId(raw: number | string): string {
  return String(raw).padStart(13, "0");
}

/** ปี พ.ศ. ที่จดทะเบียน อ่านจากหลักที่ 5–7 ของเลขทะเบียน เช่น 0105569000123 → 2569 */
export function registrationYearFromId(id: string): number | null {
  const y = Number(id.slice(4, 7));
  return Number.isFinite(y) ? 2000 + y : null;
}

const NAME_PREFIXES: Array<{ prefix: string; full: string; type: string }> = [
  { prefix: "บมจ.", full: "บริษัท ", type: "บริษัทมหาชนจำกัด" },
  { prefix: "บจ.", full: "บริษัท ", type: "บริษัทจำกัด" },
  { prefix: "หจ.", full: "ห้างหุ้นส่วนจำกัด ", type: "ห้างหุ้นส่วนจำกัด" },
  { prefix: "หส.", full: "ห้างหุ้นส่วนสามัญนิติบุคคล ", type: "ห้างหุ้นส่วนสามัญนิติบุคคล" },
];

/** หลักที่ 4 ของเลขทะเบียนบอกประเภทนิติบุคคล (ใช้เมื่อชื่อไม่มีคำย่อนำหน้า) */
const TYPE_BY_DIGIT: Record<string, string> = {
  "2": "ห้างหุ้นส่วนสามัญนิติบุคคล",
  "3": "ห้างหุ้นส่วนจำกัด",
  "5": "บริษัทจำกัด",
  "7": "บริษัทมหาชนจำกัด",
};

/** "บจ.ตัวอย่าง จำกัด" → { name: "บริษัท ตัวอย่าง จำกัด", type: "บริษัทจำกัด" } */
export function expandJuristicName(raw: string, id: string): { name: string; type: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  const hit = NAME_PREFIXES.find((p) => name.startsWith(p.prefix));
  if (!hit) return { name, type: TYPE_BY_DIGIT[id[3]] ?? "นิติบุคคล" };

  let rest = name.slice(hit.prefix.length).trim();
  if (hit.prefix === "บจ." && !rest.endsWith("จำกัด")) rest += " จำกัด";
  return { name: hit.full + rest, type: hit.type };
}

/**
 * วันที่จาก Open-D → ISO ค.ศ. รองรับ "2569-07-25T00:00:00" และ "25/07/2569"
 *
 * expectedMonth = เดือนของ resource (เช่น resource "เดือนมีนาคม" → 3)
 * บาง resource (เช่น มีนาคม 2569) ถูกแปลงวันที่สลับวัน/เดือนเมื่อวัน ≤ 12
 * เช่น 6 มี.ค. กลายเป็น "2569-06-03" → ถ้าเดือนไม่ตรงแต่ "วัน" ตรงกับเดือนของ resource ให้สลับกลับ
 */
export function parseOpendDate(raw: string | null | undefined, expectedMonth?: number | null): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : null;
  if (!parts) return null;

  let [y, m, d] = parts.map(Number);
  if (expectedMonth && m !== expectedMonth && d === expectedMonth && m <= 12) [m, d] = [d, m];
  if (y > 2400) y -= 543;

  const out = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(`${out}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.getUTCDate() === d ? out : null;
}

/** 1000000 หรือ "1,000,000.00" → 1000000 */
function parseCapital(raw: number | string | null | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const n = Number(String(raw ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** ชื่อจังหวัด/อำเภอ/ตำบลต้องเป็นอักษรไทย — แถวที่คอลัมน์เลื่อน (เช่น ได้รหัสไปรษณีย์มา) ให้เป็น null */
function adminName(raw: string | null | undefined): string | null {
  const v = stripAdminPrefix(raw ?? undefined);
  return v && /^[\u0E00-\u0E7F\s.()]{2,40}$/.test(v) ? v : null;
}

function cleanText(v: string | null | undefined): string | undefined {
  const s = v?.trim().replace(/\s+/g, " ");
  return s ? s : undefined;
}

/** ฟิลด์ที่ normalize แล้วของ 1 record — ใช้ทั้งสร้าง JuristicProfile และเขียนลง DB */
export interface NormalizedOpendRecord {
  id: string;
  nameTh: string;
  nameRaw: string;
  type: string;
  registerDate: string | null;
  dissolvedDate: string | null;
  registerCapital: number;
  tsicCode: string | null;
  objective: string | null;
  addressLine: string | null;
  subDistrict: string | null;
  district: string | null;
  province: string | null;
  postCode: string | null;
}

export interface OpendRecordContext {
  /** มาจากชุดไหน — ชุดเลิกบางเดือนเก็บวันเลิกไว้ในคอลัมน์ "วันที่จดทะเบียน" */
  kind: "new" | "dissolved";
  /** เดือนของ resource (1–12) ใช้แก้วันที่ที่สลับวัน/เดือน */
  month?: number | null;
}

export function normalizeOpendRecord(rec: OpendJuristicRecord, ctx: OpendRecordContext): NormalizedOpendRecord {
  const id = padJuristicId(rec["เลขทะเบียน"]);
  const { name, type } = expandJuristicName(rec["ชื่อนิติบุคคล"], id);
  const tsic = rec["รหัสวัตถุประสงค์"];
  const date = parseOpendDate(
    ctx.kind === "dissolved" ? (rec["วันที่จดทะเบียนเลิก"] ?? rec["วันที่จดทะเบียน"]) : rec["วันที่จดทะเบียน"],
    ctx.month,
  );
  const postCode = String(rec["รหัสไปรษณีย์"] ?? "").replace(/\D/g, "");
  return {
    id,
    nameTh: name,
    nameRaw: rec["ชื่อนิติบุคคล"].trim(),
    type,
    registerDate: ctx.kind === "new" ? date : null,
    dissolvedDate: ctx.kind === "dissolved" ? date : null,
    registerCapital: parseCapital(rec["ทุนจดทะเบียน"]),
    tsicCode: tsic ? String(tsic).padStart(5, "0") : null,
    objective: cleanText(rec["วัตถุประสงค์"]) ?? null,
    addressLine: cleanText(rec["ที่ตั้งสำนักงานใหญ่"]) ?? null,
    subDistrict: adminName(rec["ตำบล"]),
    district: adminName(rec["อำเภอ"]),
    province: adminName(rec["จังหวัด"]),
    postCode: postCode.length === 5 ? postCode : null,
  };
}

/** ข้อมูลที่ normalize แล้ว (จาก API หรือ DB) → JuristicProfile สำหรับ UI */
export function toJuristicProfile(n: NormalizedOpendRecord): JuristicProfile {
  const dissolved = n.dissolvedDate !== null;
  return {
    id: n.id,
    nameTh: n.nameTh,
    type: n.type,
    registerDate: n.registerDate,
    dissolvedDate: n.dissolvedDate,
    status: dissolved ? "dissolved" : "active",
    statusText: dissolved ? "เลิก" : "ยังดำเนินกิจการอยู่",
    registerCapital: n.registerCapital,
    tsic: n.tsicCode ? { code: n.tsicCode, description: n.objective ?? "-" } : null,
    branchName: "สำนักงานใหญ่",
    address: composeAddress({
      line: n.addressLine ?? undefined,
      subDistrict: n.subDistrict ?? undefined,
      district: n.district ?? undefined,
      province: n.province ?? undefined,
      postCode: n.postCode ?? undefined,
    }),
  };
}

/**
 * รวม record จากชุดตั้งใหม่กับชุดเลิก — ชุดเลิกให้ข้อมูลล่าสุด (ชื่อ/ทุน/ที่อยู่)
 * ส่วนวันจดทะเบียนมีเฉพาะในชุดตั้งใหม่
 */
export function mergeOpendRecords(
  registration: { rec: OpendJuristicRecord; month: number | null } | null,
  dissolution: { rec: OpendJuristicRecord; month: number | null } | null,
): NormalizedOpendRecord | null {
  const reg = registration ? normalizeOpendRecord(registration.rec, { kind: "new", month: registration.month }) : null;
  const dis = dissolution ? normalizeOpendRecord(dissolution.rec, { kind: "dissolved", month: dissolution.month }) : null;
  if (!reg && !dis) return null;
  if (!dis) return reg;
  return { ...dis, registerDate: reg?.registerDate ?? null };
}
