/**
 * วิเคราะห์คู่แข่งงานภาครัฐ — จากตาราง procurement_agency_winner (สร้างใหม่ทุกครั้งหลัง sync:egp)
 *
 * "คู่แข่ง" = นิติบุคคลอื่นที่ได้สัญญาจากหน่วยงานเดียวกัน (ไม่ได้แปลว่ายื่นประมูลแข่งกันในโครงการเดียวกัน)
 * ราคา = ส่วนต่างระหว่างราคาที่ตกลงกับราคากลาง (ข้อมูลจาก e-GP) — เป็นตัวเลขข้อเท็จจริง ไม่ใช่การประเมินความเสี่ยง
 */
import "server-only";
import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";

/** หน่วยงานหลักของบริษัทที่ใช้หาคู่แข่ง (กันหน่วยงานที่มีผู้ชนะหลายพันรายทำให้ query หนัก) */
const TOP_AGENCIES = 8;

export interface AgencyPosition {
  agency: string;
  contracts: number;
  value: number;
  /** อันดับมูลค่าในหน่วยงานนี้ (1 = มากสุด) */
  rank: number;
  winners: number;
  /** ส่วนต่างจากราคากลางเฉลี่ยของบริษัทในหน่วยงานนี้ */
  discount: number | null;
  /** ส่วนต่างเฉลี่ยของผู้ชนะทุกรายในหน่วยงานนี้ */
  agencyDiscount: number | null;
}

export interface Competitor {
  id: string;
  name: string;
  /** จำนวนหน่วยงานที่ได้งานเหมือนกัน */
  sharedAgencies: number;
  /** อยู่หมวดธุรกิจเดียวกัน (TSIC 2 หลัก) */
  sameDivision: boolean;
  /** สัญญา/มูลค่าที่คู่แข่งได้จากหน่วยงานที่ทับกัน */
  contracts: number;
  value: number;
}

export interface CompetitorInfo {
  positions: AgencyPosition[];
  competitors: Competitor[];
  price: {
    /** สัญญาที่มีราคากลางให้เทียบ */
    priced: number;
    /** ส่วนต่างจากราคากลางเฉลี่ย (ทุกหน่วยงาน) */
    discount: number | null;
    /** สัญญาที่ราคาตกลงเท่ากับราคากลางพอดี */
    equal: number;
    /** สัญญาวิธี e-bidding / ประกวดราคา */
    ebid: number;
    total: number;
  };
}

export const getCompetitorInfo = cache(async (id: string): Promise<CompetitorInfo | null> => {
  const mine = await dbQuery<RowDataPacket[]>(
    `SELECT agency, contracts, total_value, avg_discount FROM procurement_agency_winner
     WHERE winner_id = ? ORDER BY total_value DESC LIMIT ${TOP_AGENCIES}`,
    [id],
  );
  if (!mine.length) return null;
  const agencies = mine.map((r) => r.agency as string);

  const [ranks, competitors, [price]] = await Promise.all([
    dbQuery<RowDataPacket[]>(
      `SELECT me.agency,
         (SELECT COUNT(*) FROM procurement_agency_winner o WHERE o.agency = me.agency AND o.total_value > me.total_value) + 1 AS rnk,
         (SELECT COUNT(*) FROM procurement_agency_winner o WHERE o.agency = me.agency) AS winners,
         (SELECT SUM(o.avg_discount * o.contracts) / NULLIF(SUM(CASE WHEN o.avg_discount IS NOT NULL THEN o.contracts END), 0)
            FROM procurement_agency_winner o WHERE o.agency = me.agency) AS agency_disc
       FROM procurement_agency_winner me WHERE me.winner_id = ? AND me.agency IN (?)`,
      [id, agencies],
    ),
    dbQuery<RowDataPacket[]>(
      // ไม่นับหน่วยงานรัฐ/รัฐวิสาหกิจ/มูลนิธิ (เลข 099) · บริษัทหมวดธุรกิจเดียวกัน (TSIC 2 หลัก) ขึ้นก่อน
      `SELECT o.winner_id, COUNT(*) shared, SUM(o.contracts) contracts, SUM(o.total_value) value,
         COALESCE(MAX(j.name_th), MAX(s.winner_name), o.winner_id) name,
         COALESCE(MAX(LEFT(j.tsic_code, 2) = (SELECT LEFT(tsic_code, 2) FROM juristic WHERE id = ?)), 0) same_div
       FROM procurement_agency_winner o
       LEFT JOIN juristic j ON j.id = o.winner_id
       LEFT JOIN procurement_summary s ON s.winner_id = o.winner_id
       WHERE o.agency IN (?) AND o.winner_id <> ? AND o.winner_id NOT LIKE '099%'
       GROUP BY o.winner_id ORDER BY same_div DESC, shared DESC, value DESC LIMIT 10`,
      [id, agencies, id],
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) total,
         SUM(ref_price > 0 AND agreed_price > 0 AND agreed_price <= ref_price * 1.5) priced,
         AVG(CASE WHEN ref_price > 0 AND agreed_price > 0 AND agreed_price <= ref_price * 1.5 THEN (ref_price - agreed_price) / ref_price END) disc,
         SUM(ref_price > 0 AND agreed_price = ref_price) equal,
         SUM(method LIKE '%e-bidding%' OR method LIKE '%ประกวดราคา%') ebid
       FROM procurement_contract WHERE winner_id = ?`,
      [id],
    ),
  ]);
  const rankBy = new Map(ranks.map((r) => [r.agency as string, r]));
  const num = (v: unknown) => (v == null ? null : Number(v));

  return {
    positions: mine.map((r) => {
      const x = rankBy.get(r.agency);
      return {
        agency: r.agency,
        contracts: Number(r.contracts),
        value: Number(r.total_value),
        rank: Number(x?.rnk ?? 0),
        winners: Number(x?.winners ?? 0),
        discount: num(r.avg_discount),
        agencyDiscount: num(x?.agency_disc),
      };
    }),
    competitors: competitors.map((r) => ({
      id: r.winner_id,
      name: String(r.name),
      sharedAgencies: Number(r.shared),
      sameDivision: Number(r.same_div) === 1,
      contracts: Number(r.contracts),
      value: Number(r.value),
    })),
    price: {
      total: Number(price?.total ?? 0),
      priced: Number(price?.priced ?? 0),
      discount: num(price?.disc),
      equal: Number(price?.equal ?? 0),
      ebid: Number(price?.ebid ?? 0),
    },
  };
});
