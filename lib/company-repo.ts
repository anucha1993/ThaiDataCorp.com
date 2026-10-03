/**
 * Query ฝั่งเว็บสำหรับตาราง juristic (ข้อมูลที่ sync จาก Open-D ด้วย `npm run sync`)
 */
import "server-only";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { mapStatus } from "@/lib/dbd-normalize";
import { toJuristicProfile } from "@/lib/opend-normalize";
import type { DataAsOf, DirectorsApiResponse, FinancialsApiResponse, JuristicProfile } from "@/types/company";

/** Google จำกัด 50,000 URL ต่อ sitemap 1 ไฟล์ */
export const SITEMAP_CHUNK_SIZE = 50_000;

interface JuristicRow extends RowDataPacket {
  id: string;
  name_th: string;
  name_raw: string;
  name_en: string | null;
  juristic_type: string;
  status_text: string | null;
  register_date: string | null;
  dissolved_date: string | null;
  register_capital: number;
  tsic_code: string | null;
  objective: string | null;
  address_line: string | null;
  sub_district: string | null;
  district: string | null;
  province: string | null;
  post_code: string | null;
  /** ชื่อหมวด TSIC ทางการ (join จากตาราง tsic) */
  tsic_name: string | null;
}

// SELECT + JOIN ชื่อหมวด TSIC ทางการ — ใช้ alias j. เพราะตาราง tsic ก็มีคอลัมน์ name_th
const SELECT_PROFILE = `SELECT j.id, j.name_th, j.name_raw, j.name_en, j.juristic_type, j.status_text, j.register_date,
  j.dissolved_date, j.register_capital, j.tsic_code, j.objective, j.address_line, j.sub_district, j.district,
  j.province, j.post_code, t.name_th AS tsic_name
  FROM juristic j LEFT JOIN tsic t ON t.code = j.tsic_code`;

function rowToProfile(r: JuristicRow): JuristicProfile {
  const profile = toJuristicProfile({
    id: r.id,
    nameTh: r.name_th,
    nameRaw: r.name_raw,
    type: r.juristic_type,
    registerDate: r.register_date,
    dissolvedDate: r.dissolved_date,
    registerCapital: r.register_capital,
    tsicCode: r.tsic_code,
    objective: r.objective,
    addressLine: r.address_line,
    subDistrict: r.sub_district,
    district: r.district,
    province: r.province,
    postCode: r.post_code,
  });
  // สถานะจาก DBD Open API เป็นข้อมูลล่าสุด (รู้ "ร้าง" / "เสร็จการชำระบัญชี" ด้วย) — ใช้แทนการเดาจากวันเลิก
  const status = r.status_text ? { status: mapStatus(r.status_text), statusText: r.status_text } : {};
  // ชื่อหมวดใช้ชื่อทางการจากตาราง tsic; "วัตถุประสงค์" ที่บริษัทเขียนเองแสดงแยก (ถ้าต่างจากชื่อหมวด)
  const objective = cleanObjective(r.objective);
  const tsic = profile.tsic && r.tsic_name ? { ...profile.tsic, description: r.tsic_name } : profile.tsic;
  return {
    ...profile,
    tsic,
    ...(objective && objective !== r.tsic_name && { objective }),
    ...(r.name_en && { nameEn: r.name_en }),
    ...status,
  };
}

/** ตัดเลขข้อ/สัญลักษณ์นำหน้าที่ติดมาจากข้อมูลต้นทาง เช่น "1. ", ".", "?" */
function cleanObjective(raw: string | null): string | undefined {
  const s = raw?.replace(/^[\s.?\-–•*]*(\d+[.)]\s*)?/, "").replace(/\s+/g, " ").trim();
  return s || undefined;
}

/** ดึงรายการนิติบุคคลตามเงื่อนไข (ใช้ alias j.) — สำหรับหน้า list/pSEO */
export async function listJuristicWhere(
  where: string,
  params: unknown[],
  orderBy: string,
  limit: number,
  offset = 0,
): Promise<JuristicProfile[]> {
  const rows = await dbQuery<JuristicRow[]>(
    `${SELECT_PROFILE} WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows.map(rowToProfile);
}

export { upsertDbdProfile } from "@/lib/juristic-write";

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

interface FreshnessRow extends JuristicRow {
  dbd_fetched_at: Date | null;
  res_kind: "new" | "dissolved" | null;
  res_year: number | null;
  res_month: number | null;
  res_synced: Date | null;
}

export async function findJuristicById(id: string): Promise<JuristicProfile | null> {
  // ชุดข้อมูลรายเดือนที่ให้ข้อมูลล่าสุด: ชุดเลิก (ถ้ามี) ใหม่กว่าชุดตั้งใหม่
  const rows = await dbQuery<FreshnessRow[]>(
    `SELECT p.*, IF(p.dissolved_resource_id IS NOT NULL, 'dissolved', IF(p.new_resource_id IS NOT NULL, 'new', NULL)) AS res_kind,
       s.year_be AS res_year, s.month AS res_month, s.synced_at AS res_synced
     FROM (${SELECT_PROFILE.replace("SELECT j.id,", "SELECT j.dbd_fetched_at, j.new_resource_id, j.dissolved_resource_id, j.id,")} WHERE j.id = ?) p
     LEFT JOIN sync_resource s ON s.resource_id = COALESCE(p.dissolved_resource_id, p.new_resource_id)`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return { ...rowToProfile(r), ...(dataAsOf(r) && { dataAsOf: dataAsOf(r) }) };
}

function dataAsOf(r: FreshnessRow): DataAsOf | undefined {
  if (r.dbd_fetched_at) return { kind: "dbd", at: new Date(r.dbd_fetched_at).toISOString() };
  if (r.res_kind && r.res_synced) {
    return {
      kind: r.res_kind === "dissolved" ? "opend-dissolved" : "opend-new",
      at: new Date(r.res_synced).toISOString(),
      ...(r.res_year && r.res_month && { period: `${THAI_MONTHS[r.res_month - 1]} ${r.res_year}` }),
    };
  }
  return undefined;
}

/** true เมื่อยังไม่เคยตรวจกับ DBD Open API หรือตรวจไว้นานกว่า maxAgeDays วัน */
export async function isDbdStale(id: string, maxAgeDays: number): Promise<boolean> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT dbd_fetched_at IS NULL OR dbd_fetched_at < NOW() - INTERVAL ? DAY AS stale FROM juristic WHERE id = ?`,
    [maxAgeDays, id],
  );
  return Boolean(rows[0]?.stale);
}

/** บันทึกว่าตรวจกับ DBD แล้ว (ใช้เมื่อ DBD ไม่พบข้อมูล จะได้ไม่ถามซ้ำทุกครั้ง) */
export async function markDbdChecked(id: string): Promise<void> {
  await dbQuery(`UPDATE juristic SET dbd_fetched_at = NOW() WHERE id = ?`, [id]);
}

/**
 * ค้นชื่อด้วย LIKE — MariaDB ไม่มี ngram parser สำหรับ FULLTEXT ภาษาไทย (ไม่มีช่องว่างคั่นคำ)
 * ข้อมูลหลักแสนแถว full scan ยังเร็วพอสำหรับหน้าค้นหา (noindex, traffic ต่ำ)
 */
export async function searchJuristicByName(query: string, limit = 30): Promise<JuristicProfile[]> {
  const escaped = query.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  return listJuristicWhere(
    `j.name_th LIKE ? OR j.name_raw LIKE ?`,
    [`%${escaped}%`, `%${escaped}%`],
    `(j.dissolved_date IS NULL) DESC, j.register_date DESC`,
    limit,
  );
}

export async function listRecentJuristic(limit = 20): Promise<JuristicProfile[]> {
  return listJuristicWhere(`j.register_date IS NOT NULL`, [], `j.register_date DESC, j.id DESC`, limit);
}

export async function countJuristic(): Promise<number> {
  const rows = await dbQuery<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM juristic`);
  return Number(rows[0]?.n ?? 0);
}

/** เลขทะเบียน + เวลาแก้ไขล่าสุด สำหรับ sitemap ชิ้นที่ `chunk` (เริ่มที่ 0) */
export async function listJuristicForSitemap(chunk: number): Promise<Array<{ id: string; updatedAt: string }>> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT id, updated_at FROM juristic ORDER BY id LIMIT ? OFFSET ?`,
    [SITEMAP_CHUNK_SIZE, chunk * SITEMAP_CHUNK_SIZE],
  );
  // ใช้เฉพาะวันที่ (W3C date) — เลี่ยงปัญหา timezone ของ session DB
  return rows.map((r) => ({ id: r.id as string, updatedAt: String(r.updated_at).slice(0, 10) }));
}

/** กรรมการ / ผู้ถือหุ้น / งบการเงิน / อำนาจกรรมการ ของบริษัท (ตาราง juristic_*) */
export async function findCompanyDetails(id: string): Promise<DirectorsApiResponse & FinancialsApiResponse> {
  const [directors, shareholders, financials, extra] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT seq, name, position FROM juristic_director WHERE juristic_id = ? ORDER BY seq`, [id]),
    dbQuery<RowDataPacket[]>(
      `SELECT seq, name, nationality, shares, percent FROM juristic_shareholder WHERE juristic_id = ? ORDER BY seq`,
      [id],
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT fiscal_year, total_revenue, net_profit, total_assets, total_liabilities, equity
       FROM juristic_financial WHERE juristic_id = ? ORDER BY fiscal_year DESC`,
      [id],
    ),
    dbQuery<RowDataPacket[]>(`SELECT authorized_signatory FROM juristic WHERE id = ?`, [id]),
  ]);

  return {
    directors: directors.map((d) => ({ order: d.seq, name: d.name, ...(d.position && { position: d.position }) })),
    shareholders: shareholders.map((s) => ({
      order: s.seq,
      name: s.name,
      ...(s.nationality && { nationality: s.nationality }),
      shares: Number(s.shares),
      percent: Number(s.percent),
    })),
    financials: financials.map((f) => ({
      fiscalYear: f.fiscal_year,
      totalRevenue: f.total_revenue,
      netProfit: f.net_profit,
      totalAssets: f.total_assets,
      ...(f.total_liabilities != null && { totalLiabilities: f.total_liabilities }),
      ...(f.equity != null && { equity: f.equity }),
    })),
    authorizedSignatory: extra[0]?.authorized_signatory ?? undefined,
  };
}

/**
 * นิติบุคคลอื่นที่จดทะเบียน "ที่อยู่เดียวกันทุกตัวอักษร" (บรรทัดที่อยู่ + ตำบล + จังหวัด)
 * ใช้ตรวจสอบคู่ค้าเบื้องต้น เช่น ที่อยู่สำนักงานบริการ/ออฟฟิศเสมือนที่มีหลายบริษัทใช้ร่วมกัน
 */
export async function findSameAddress(
  id: string,
  limit = 30,
): Promise<{ total: number; companies: Array<{ profile: JuristicProfile; govContracts: number }> }> {
  const SAME = `j.province = me.province AND j.sub_district <=> me.sub_district AND j.address_line = me.address_line
    AND j.id <> me.id AND CHAR_LENGTH(me.address_line) >= 6 AND me.address_line REGEXP '[0-9]'`;
  const [countRows, rows] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM juristic me JOIN juristic j ON ${SAME} WHERE me.id = ?`, [id]),
    dbQuery<JuristicRow[]>(
      `${SELECT_PROFILE.replace("FROM juristic j", "FROM juristic me JOIN juristic j ON " + SAME)}
       WHERE me.id = ? ORDER BY (j.dissolved_date IS NULL) DESC, j.register_date DESC LIMIT ?`,
      [id, limit],
    ),
  ]);
  const ids = rows.map((r) => r.id);
  const gov = ids.length
    ? await dbQuery<RowDataPacket[]>(`SELECT winner_id, contracts FROM procurement_summary WHERE winner_id IN (?)`, [ids])
    : [];
  const govMap = new Map(gov.map((g) => [g.winner_id as string, Number(g.contracts)]));
  return {
    total: Number(countRows[0]?.n ?? 0),
    companies: rows.map((r) => ({ profile: rowToProfile(r), govContracts: govMap.get(r.id) ?? 0 })),
  };
}
