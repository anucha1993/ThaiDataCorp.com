/**
 * ตัวกรองค้นหาขั้นสูง — ไม่มี I/O ใช้ร่วมกันระหว่างเว็บ (/search, /export/search) และสคริปต์แจ้งเตือน (send-alerts)
 */

export const SORTS = {
  new: { label: "จดทะเบียนล่าสุด", sql: "j.register_date DESC, j.id DESC" },
  old: { label: "จดทะเบียนเก่าสุด", sql: "j.register_date ASC, j.id ASC" },
  capital: { label: "ทุนจดทะเบียนมากสุด", sql: "j.register_capital DESC, j.id DESC" },
  name: { label: "ชื่อ ก–ฮ", sql: "j.name_th ASC" },
} as const;
export type SortKey = keyof typeof SORTS;

export const JURISTIC_TYPES = ["บริษัทจำกัด", "ห้างหุ้นส่วนจำกัด", "ห้างหุ้นส่วนสามัญนิติบุคคล", "บริษัทมหาชนจำกัด"] as const;

export interface SearchFilters {
  q?: string;
  /** รหัส TSIC 2–5 หลัก (2 หลัก = ทั้งหมวดย่อย, 5 หลัก = กิจกรรมเจาะจง) */
  tsic?: string;
  province?: string;
  type?: string;
  status?: "active" | "dissolved";
  /** วันจดทะเบียน YYYY-MM-DD (ค.ศ.) */
  from?: string;
  to?: string;
  capMin?: number;
  capMax?: number;
  /** เคยได้งานภาครัฐ (e-GP) */
  gov?: boolean;
  /** จดทะเบียนภาษีมูลค่าเพิ่ม (กรมสรรพากร) */
  vat?: boolean;
  sort: SortKey;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
const money = (v?: string) => {
  const n = Number(v?.replace(/[,\s]/g, ""));
  return v && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function parseFilters(sp: Params): SearchFilters {
  // ช่องรหัส TSIC ที่พิมพ์เอง (tsic_code) มาก่อนหมวดที่เลือกจากรายการ (tsic)
  const tsic = [one(sp.tsic_code), one(sp.tsic)].find((t) => t && /^\d{2,5}$/.test(t));
  const status = one(sp.status);
  const sort = one(sp.sort);
  const type = one(sp.type);
  return {
    q: one(sp.q)?.slice(0, 200),
    tsic,
    province: one(sp.province)?.slice(0, 128),
    type: JURISTIC_TYPES.includes(type as (typeof JURISTIC_TYPES)[number]) ? type : undefined,
    status: status === "active" || status === "dissolved" ? status : undefined,
    from: date(one(sp.from)),
    to: date(one(sp.to)),
    capMin: money(one(sp.cap_min)),
    capMax: money(one(sp.cap_max)),
    gov: one(sp.gov) === "1",
    vat: one(sp.vat) === "1",
    sort: sort && sort in SORTS ? (sort as SortKey) : "new",
  };
}

/** ใช้ตัวกรองขั้นสูงอยู่หรือไม่ (นอกจากชื่อ) */
export function hasAdvanced(f: SearchFilters): boolean {
  return Boolean(f.tsic || f.province || f.type || f.status || f.from || f.to || f.capMin != null || f.capMax != null || f.gov || f.vat || f.sort !== "new");
}

/** แปลงตัวกรองกลับเป็น query string (สำหรับลิงก์หน้าถัดไป / CSV) */
export function filtersToQuery(f: SearchFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.q) q.set("q", f.q);
  if (f.tsic) q.set("tsic", f.tsic);
  if (f.province) q.set("province", f.province);
  if (f.type) q.set("type", f.type);
  if (f.status) q.set("status", f.status);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.capMin != null) q.set("cap_min", String(f.capMin));
  if (f.capMax != null) q.set("cap_max", String(f.capMax));
  if (f.gov) q.set("gov", "1");
  if (f.vat) q.set("vat", "1");
  if (f.sort !== "new") q.set("sort", f.sort);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

export function buildWhere(f: SearchFilters): { where: string; params: unknown[] } {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push("(j.name_th LIKE ? OR j.name_raw LIKE ? OR j.name_en LIKE ?)");
    params.push(like, like, like);
  }
  if (f.tsic) {
    if (f.tsic.length === 5) (where.push("j.tsic_code = ?"), params.push(f.tsic));
    else (where.push("j.tsic_code LIKE ?"), params.push(`${f.tsic}%`));
  }
  if (f.province) (where.push("j.province = ?"), params.push(f.province));
  if (f.type) (where.push("j.juristic_type = ?"), params.push(f.type));
  // สถานะ: ใช้สถานะล่าสุดจาก DBD ถ้ามี ไม่งั้นดูจากวันเลิกกิจการ
  const active = "(j.dissolved_date IS NULL AND (j.status_text IS NULL OR j.status_text LIKE '%ดำเนินกิจการ%'))";
  if (f.status === "active") where.push(active);
  if (f.status === "dissolved") where.push(`NOT ${active}`);
  if (f.from) (where.push("j.register_date >= ?"), params.push(f.from));
  if (f.to) (where.push("j.register_date <= ?"), params.push(f.to));
  if (f.capMin != null) (where.push("j.register_capital >= ?"), params.push(f.capMin));
  if (f.capMax != null) (where.push("j.register_capital <= ?"), params.push(f.capMax));
  if (f.gov) where.push("EXISTS (SELECT 1 FROM procurement_summary ps WHERE ps.winner_id = j.id)");
  if (f.vat) where.push("EXISTS (SELECT 1 FROM juristic_vat jv WHERE jv.tax_id = j.id)");
  return { where: where.join(" AND "), params };
}

/** คำอธิบายตัวกรองแบบสั้น เช่น "ก่อสร้าง (41) · ชลบุรี · ทุน ≥ 1,000,000 · จด VAT" (tsicName = ชื่อหมวดถ้ารู้) */
export function describeFilters(f: SearchFilters, tsicName?: string | null): string {
  const n = (v: number) => v.toLocaleString("th-TH");
  const parts = [
    f.q && `ชื่อมีคำว่า "${f.q}"`,
    f.tsic && (tsicName ? `${tsicName} (${f.tsic})` : `ประเภทธุรกิจ ${f.tsic}`),
    f.province,
    f.type,
    f.status === "active" ? "ยังดำเนินกิจการ" : f.status === "dissolved" ? "เลิก/ร้าง" : null,
    f.from && `จดทะเบียนตั้งแต่ ${f.from}`,
    f.to && `ถึง ${f.to}`,
    f.capMin != null && `ทุน ≥ ${n(f.capMin)}`,
    f.capMax != null && `ทุน ≤ ${n(f.capMax)}`,
    f.vat && "จด VAT",
    f.gov && "เคยได้งานภาครัฐ",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "ทุกนิติบุคคล";
}

/** query string ที่บันทึกไว้ → ตัวกรอง */
export function filtersFromQuery(query: string): SearchFilters {
  const sp: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(query)) sp[k] = v;
  return parseFilters(sp);
}
