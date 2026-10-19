/**
 * บทวิเคราะห์เฉพาะบริษัท — เทียบกับนิติบุคคลในประเภทธุรกิจ (TSIC) เดียวกัน ทั้งในจังหวัดและทั่วประเทศ
 * ทำให้แต่ละหน้ามีเนื้อหาเฉพาะตัว (ไม่ใช่แค่แม่แบบเดียวกันที่เปลี่ยนตัวเลข) — ข้อเท็จจริงเชิงสถิติ ไม่ใช่การประเมินความน่าเชื่อถือ
 */
import "server-only";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";

/** กลุ่มเปรียบเทียบที่เล็กกว่านี้ไม่สรุปเป็นสถิติ (ตัวเลขไม่มีความหมาย) */
const MIN_PEERS = 8;

export interface PeerStats {
  scope: "province" | "national";
  /** จำนวนนิติบุคคลที่ยังดำเนินกิจการในกลุ่ม (รวมบริษัทนี้) */
  peers: number;
  /** สัดส่วนของกลุ่มที่ทุนน้อยกว่าบริษัทนี้ (0–1) */
  capitalBelow: number;
  capitalMedian: number;
  /** อายุกิจการ (ปี) ค่ากลางของกลุ่ม */
  ageMedianYears: number | null;
  /** สัดส่วนของกลุ่มที่จดทะเบียนก่อนบริษัทนี้ (0–1) */
  olderShare: number | null;
  /** สัดส่วนของกลุ่มที่จด VAT */
  vatShare: number | null;
  /** เปิดใหม่ในกลุ่มนี้ 12 เดือนล่าสุด */
  newLast12m: number;
  /** ได้งานภาครัฐ: จำนวนในกลุ่มที่เคยได้งาน + อันดับมูลค่าของบริษัทนี้ */
  govWinners: number;
  govRank: number | null;
  provinceShare: number | null;
}

async function peerStats(
  id: string,
  tsic: string,
  province: string | null,
  capital: number,
  registerDate: string | null,
): Promise<PeerStats | null> {
  const scopeWhere = province ? `j.tsic_code = ? AND j.province = ?` : `j.tsic_code = ?`;
  const scopeParams = province ? [tsic, province] : [tsic];
  const active = `${scopeWhere} AND j.dissolved_date IS NULL`;

  const [[base]] = await Promise.all([
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) n, SUM(j.register_capital < ?) below,
         SUM(j.register_date < ?) older, SUM(j.register_date >= CURDATE() - INTERVAL 12 MONTH) new12
       FROM juristic j WHERE ${active}`,
      [capital, registerDate ?? "9999-12-31", ...scopeParams],
    ),
  ]);
  const n = Number(base?.n ?? 0);
  if (n < MIN_PEERS) return null;

  const mid = Math.floor(n / 2);
  const [[median], [age], [vat], [gov], provinceTotal] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT j.register_capital c FROM juristic j WHERE ${active} ORDER BY j.register_capital LIMIT 1 OFFSET ${mid}`, scopeParams),
    dbQuery<RowDataPacket[]>(
      `SELECT DATEDIFF(CURDATE(), j.register_date) / 365.25 y FROM juristic j WHERE ${active} AND j.register_date IS NOT NULL
       ORDER BY j.register_date LIMIT 1 OFFSET ${mid}`,
      scopeParams,
    ),
    // นับเฉพาะกลุ่มไม่ใหญ่มาก (กันหน้าโหลดช้า) — กลุ่มใหญ่ใช้ตัวอย่าง 3,000 รายล่าสุด
    dbQuery<RowDataPacket[]>(
      `SELECT AVG(EXISTS (SELECT 1 FROM juristic_vat v WHERE v.tax_id = x.id)) s
       FROM (SELECT j.id FROM juristic j WHERE ${active} ORDER BY j.register_date DESC LIMIT 3000) x`,
      scopeParams,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) winners,
         SUM(s.total_value > COALESCE((SELECT total_value FROM procurement_summary WHERE winner_id = ?), -1)) above,
         MAX(s.winner_id = ?) self
       FROM juristic j JOIN procurement_summary s ON s.winner_id = j.id WHERE ${active}`,
      [id, id, ...scopeParams],
    ),
    province
      ? dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM juristic j WHERE j.tsic_code = ? AND j.dissolved_date IS NULL`, [tsic])
      : Promise.resolve([] as RowDataPacket[]),
  ]);
  const national = Number(provinceTotal[0]?.n ?? 0);
  return {
    scope: province ? "province" : "national",
    peers: n,
    capitalBelow: Number(base.below ?? 0) / n,
    capitalMedian: Number(median?.c ?? 0),
    ageMedianYears: age?.y != null ? Number(age.y) : null,
    olderShare: registerDate ? Number(base.older ?? 0) / n : null,
    vatShare: vat?.s != null ? Number(vat.s) : null,
    newLast12m: Number(base.new12 ?? 0),
    govWinners: Number(gov?.winners ?? 0),
    govRank: Number(gov?.self ?? 0) === 1 ? Number(gov.above ?? 0) + 1 : null,
    provinceShare: province && national > 0 ? n / national : null,
  };
}

/** สถิติเทียบกลุ่ม — ใช้จังหวัดก่อน ถ้ากลุ่มในจังหวัดเล็กเกินไปใช้ทั่วประเทศ */
export async function getPeerStats(p: {
  id: string;
  tsic: string | null;
  province: string | null;
  capital: number;
  registerDate: string | null;
}): Promise<PeerStats | null> {
  if (!p.tsic) return null;
  return (
    (p.province ? await peerStats(p.id, p.tsic, p.province, p.capital, p.registerDate) : null) ??
    (await peerStats(p.id, p.tsic, null, p.capital, p.registerDate))
  );
}
