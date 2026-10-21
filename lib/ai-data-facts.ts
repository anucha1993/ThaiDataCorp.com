/**
 * ข้อเท็จจริงจากฐานข้อมูลของเราเอง สำหรับบทความ "สถิติธุรกิจ" — AI แค่เรียบเรียง ตัวเลขทุกตัวมาจากที่นี่
 * (ไม่ import "server-only" เพื่อให้สคริปต์ ai-articles ใช้ได้)
 *
 * ขอบเขตข้อมูล: นิติบุคคลที่จดทะเบียนตั้งแต่ 1 ม.ค. 2565 (ข้อมูลเปิด DBD รายเดือนครบตั้งแต่ช่วงนั้น)
 * — ก่อนหน้านั้นมีในฐานแค่บางส่วน จึงไม่นับ เพื่อไม่ให้สรุป "จำนวนทั้งประเทศ" ผิด
 */
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import type { TrendData } from "@/lib/ai-claims";
import { dbQuery } from "@/lib/db";

export const DATA_FROM = "2022-01-01";
/** กลุ่มที่เล็กกว่านี้ไม่เขียน (สถิติไม่มีความหมาย) */
export const MIN_NATIONAL = 300;
export const MIN_PROVINCE = 100;

export interface Segment {
  tsic: string;
  province: string | null;
}

export interface DataFacts {
  key: string;
  slug: string;
  segment: Segment;
  tsicName: string;
  /** ชื่อกลุ่มสำหรับใส่ในหัวเรื่อง เช่น "ธุรกิจร้านอาหาร ในจังหวัดเชียงใหม่" */
  subject: string;
  /** ข้อเท็จจริงเป็นบรรทัดภาษาไทย — ส่งให้ AI */
  lines: string[];
  /** ตารางข้อมูลสำคัญ (แสดงบนหน้าเว็บตรงจากฐานข้อมูล ไม่ผ่าน AI) */
  table: Array<{ label: string; value: string }>;
  source: string;
  links: Array<{ href: string; label: string }>;
  /** ตัวเลขที่อนุญาตให้ปรากฏในบทความ */
  allowed: Set<string>;
  /** ข้อมูลรายปี/12 เดือน สำหรับตรวจข้อความเชิงเปรียบเทียบ (lib/ai-claims) */
  trend: TrendData;
  /** ตัวเลขดิบ (ใช้ตรวจซ้ำใน scripts/test-ai-articles.ts) */
  raw: Parameters<typeof factProblems>[0];
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const num = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (a: number, b: number) => (b > 0 ? `ร้อยละ ${(Math.round((a / b) * 1000) / 10).toString()}` : "-");
const baht = (c: number) =>
  c >= 1_000_000 ? `${(Math.round((c / 1_000_000) * 100) / 100).toString()} ล้านบาท` : `${num(c)} บาท`;
const thMonth = (d: string) => `${TH_MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(0, 4)) + 543}`;
const inProv = (p: string) => (p.includes("กรุงเทพ") ? `ใน${p}` : `ในจังหวัด${p}`);

export const segmentKey = (s: Segment) => `tsic:${s.tsic}${s.province ? `:${s.province}` : ""}`;
const segmentSlug = (s: Segment) =>
  `business-stats-${s.tsic}${s.province ? `-${createHash("md5").update(s.province).digest("hex").slice(0, 6)}` : ""}`;

/** ตัวเลขในข้อความ (แปลงเลขไทย ตัดจุลภาค) */
export function numbersIn(text: string): string[] {
  const t = text.replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)));
  return (t.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []).map((x) => x.replace(/,/g, ""));
}

/** การเปรียบเทียบรายปีที่ระบบคำนวณเอง — AI มักสรุปทิศทาง (เพิ่ม/ลด/สูงสุด) ผิดถ้าให้คิดเอง */
function yearComparisons(years: RowDataPacket[], lastYear: number, partial: boolean, toTh: string): string[] {
  const full = years.map((y) => ({ y: Number(y.y), n: Number(y.n) })).filter((y) => !(partial && y.y === lastYear));
  const out: string[] = [];
  if (full.length >= 2) {
    const max = full.reduce((a, b) => (b.n > a.n ? b : a));
    const min = full.reduce((a, b) => (b.n < a.n ? b : a));
    out.push(
      `ในบรรดาปีที่มีข้อมูลครบทั้งปี ปีที่จดทะเบียนใหม่มากที่สุดคือปี ${max.y + 543} (${num(max.n)} ราย) น้อยที่สุดคือปี ${min.y + 543} (${num(min.n)} ราย)`,
    );
    out.push(
      `ทิศทางรายปี (เฉพาะปีที่ครบทั้งปี): ${full
        .slice(1)
        .map((y, i) => `ปี ${y.y + 543} ${y.n > full[i].n ? "เพิ่มขึ้น" : y.n < full[i].n ? "ลดลง" : "เท่าเดิม"}จากปี ${full[i].y + 543}`)
        .join(", ")}`,
    );
  }
  if (partial) out.push(`ปี ${lastYear + 543} มีข้อมูลถึง ${toTh} เท่านั้น (ยังไม่ครบปี) ห้ามนำไปเทียบกับปีที่ครบทั้งปี ถ้าจะพูดถึงช่วงล่าสุดให้ใช้ตัวเลข 12 เดือนล่าสุดแทน`);
  return out;
}

/** กฎความสอดคล้องของตัวเลข — คืนรายการปัญหา (ว่าง = ผ่าน) */
export function factProblems(f: {
  n: number;
  active: number;
  dissolved: number;
  yearsSum: number;
  typesSum: number;
  bracketsSum: number;
  p25: number;
  med: number;
  p75: number;
  modeN: number;
  geo: number[];
  vat: number;
  govWinners: number;
  tisi: number;
  last12: number;
  prev12: number;
}): string[] {
  const p: string[] = [];
  if (f.active + f.dissolved !== f.n) p.push("ยังดำเนินกิจการ + เลิกกิจการ ≠ ทั้งหมด");
  if (f.yearsSum !== f.n) p.push("ผลรวมรายปี ≠ ทั้งหมด");
  if (f.typesSum !== f.n) p.push("ผลรวมรูปแบบนิติบุคคล ≠ ทั้งหมด");
  if (f.bracketsSum !== f.n) p.push("ผลรวมช่วงทุน ≠ ทั้งหมด");
  if (!(f.p25 <= f.med && f.med <= f.p75)) p.push("ควอร์ไทล์ทุนไม่เรียงกัน");
  if (f.modeN > f.n) p.push("ทุนที่พบบ่อยมากกว่าทั้งหมด");
  if (f.geo.some((g, i) => g > f.n || (i > 0 && g > f.geo[i - 1]))) p.push("อันดับพื้นที่ไม่เรียงหรือเกินทั้งหมด");
  if (f.vat > f.active || f.govWinners > f.active || f.tisi > f.active) p.push("VAT/งานรัฐ/มอก. มากกว่าจำนวนที่ยังดำเนินกิจการ");
  if (f.last12 > f.n || f.prev12 > f.n) p.push("ยอด 12 เดือนมากกว่าทั้งหมด");
  return p;
}

/** วันสุดท้ายที่มีข้อมูลจดทะเบียน (ข้อมูลเปิดอัปเดตรายเดือน) */
async function dataAsOf(): Promise<string> {
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT DATE_FORMAT(MAX(register_date), '%Y-%m-%d') d FROM juristic`);
  return String(r?.d ?? new Date().toISOString().slice(0, 10));
}

/** กลุ่มที่ยังไม่มีบทความ เรียงจากกลุ่มใหญ่ — ระดับประเทศก่อน แล้วค่อยรายจังหวัด */
export async function nextSegments(limit: number): Promise<Segment[]> {
  const [done, national] = await Promise.all([
    // มีบทความแล้ว (รวมที่ผู้ดูแลกด "ไม่ใช้") หรือเคยล้มเหลว — ลบรายการล้มเหลวในคิวหัวข้อเพื่อให้ลองใหม่ได้
    dbQuery<RowDataPacket[]>(
      `SELECT data_key FROM ai_article WHERE data_key IS NOT NULL UNION SELECT topic FROM ai_topic WHERE topic LIKE 'tsic:%'`,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT tsic_code t, COUNT(*) n FROM juristic WHERE register_date >= ? AND tsic_code IS NOT NULL
       GROUP BY tsic_code HAVING n >= ? ORDER BY n DESC`,
      [DATA_FROM, MIN_NATIONAL],
    ),
  ]);
  const used = new Set(done.map((r) => String(r.data_key)));
  const out: Segment[] = [];
  for (const r of national) {
    const s = { tsic: String(r.t), province: null };
    if (!used.has(segmentKey(s))) out.push(s);
    if (out.length >= limit) return out;
  }
  const provincial = await dbQuery<RowDataPacket[]>(
    `SELECT tsic_code t, province p, COUNT(*) n FROM juristic
     WHERE register_date >= ? AND tsic_code IS NOT NULL AND province IS NOT NULL AND province <> ''
     GROUP BY tsic_code, province HAVING n >= ? ORDER BY n DESC`,
    [DATA_FROM, MIN_PROVINCE],
  );
  for (const r of provincial) {
    const s = { tsic: String(r.t), province: String(r.p) };
    if (!used.has(segmentKey(s))) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

export async function gatherFacts(seg: Segment): Promise<DataFacts | null> {
  const asOf = await dataAsOf();
  const where = `j.register_date >= ? AND j.tsic_code = ?${seg.province ? " AND j.province = ?" : ""}`;
  const params = [DATA_FROM, seg.tsic, ...(seg.province ? [seg.province] : [])];

  const [[name], [base]] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT name_th FROM tsic WHERE code = ? LIMIT 1`, [seg.tsic]),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) n, SUM(j.dissolved_date IS NOT NULL) dissolved, SUM(j.dissolved_date IS NULL) active,
         SUM(j.register_date > ? - INTERVAL 12 MONTH) last12,
         SUM(j.register_date > ? - INTERVAL 24 MONTH AND j.register_date <= ? - INTERVAL 12 MONTH) prev12
       FROM juristic j WHERE ${where}`,
      [asOf, asOf, asOf, ...params],
    ),
  ]);
  const n = Number(base?.n ?? 0);
  const tsicName = String(name?.name_th ?? "").trim();
  if (!tsicName || n < (seg.province ? MIN_PROVINCE : MIN_NATIONAL)) return null;

  const [years, types, [q], brackets, [mode], geo, [vat], [gov], [tisi], natRank] = await Promise.all([
    dbQuery<RowDataPacket[]>(`SELECT YEAR(j.register_date) y, COUNT(*) n FROM juristic j WHERE ${where} GROUP BY y ORDER BY y`, params),
    dbQuery<RowDataPacket[]>(`SELECT j.juristic_type t, COUNT(*) n FROM juristic j WHERE ${where} GROUP BY t ORDER BY n DESC`, params),
    dbQuery<RowDataPacket[]>(
      `SELECT
         (SELECT j.register_capital FROM juristic j WHERE ${where} ORDER BY j.register_capital LIMIT 1 OFFSET ${Math.floor(n / 2)}) med,
         (SELECT j.register_capital FROM juristic j WHERE ${where} ORDER BY j.register_capital LIMIT 1 OFFSET ${Math.floor(n / 4)}) p25,
         (SELECT j.register_capital FROM juristic j WHERE ${where} ORDER BY j.register_capital LIMIT 1 OFFSET ${Math.floor((n * 3) / 4)}) p75`,
      [...params, ...params, ...params],
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT SUM(j.register_capital < 1000000) small, SUM(j.register_capital >= 1000000 AND j.register_capital < 5000000) mid,
         SUM(j.register_capital >= 5000000) big FROM juristic j WHERE ${where}`,
      params,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT j.register_capital c, COUNT(*) n FROM juristic j WHERE ${where} GROUP BY c ORDER BY n DESC LIMIT 1`,
      params,
    ),
    seg.province
      ? dbQuery<RowDataPacket[]>(
          `SELECT j.district g, COUNT(*) n FROM juristic j WHERE ${where} AND j.district IS NOT NULL AND j.district <> '' GROUP BY g ORDER BY n DESC LIMIT 5`,
          params,
        )
      : dbQuery<RowDataPacket[]>(
          `SELECT j.province g, COUNT(*) n FROM juristic j WHERE ${where} AND j.province IS NOT NULL AND j.province <> '' GROUP BY g ORDER BY n DESC LIMIT 5`,
          params,
        ),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) n FROM juristic j WHERE ${where} AND j.dissolved_date IS NULL AND EXISTS (SELECT 1 FROM juristic_vat v WHERE v.tax_id = j.id)`,
      params,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) winners, COALESCE(SUM(s.contracts), 0) contracts FROM juristic j JOIN procurement_summary s ON s.winner_id = j.id WHERE ${where} AND j.dissolved_date IS NULL`,
      params,
    ),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT t.tax_id) n FROM juristic j JOIN juristic_tisi t ON t.tax_id = j.id WHERE ${where} AND j.dissolved_date IS NULL`,
      params,
    ),
    seg.province
      ? dbQuery<RowDataPacket[]>(
          `SELECT j.province p, COUNT(*) n FROM juristic j WHERE j.register_date >= ? AND j.tsic_code = ? AND j.province IS NOT NULL AND j.province <> ''
           GROUP BY p ORDER BY n DESC`,
          [DATA_FROM, seg.tsic],
        )
      : Promise.resolve([] as RowDataPacket[]),
  ]);

  const fromTh = thMonth(DATA_FROM);
  const toTh = thMonth(asOf);
  const where2 = seg.province ? inProv(seg.province) : "ทั่วประเทศ";
  const subject = `ธุรกิจ${tsicName.replace(/^การ/, "")} ${where2}`.replace(/\s+/g, " ");
  const dissolved = Number(base.dissolved ?? 0);
  const active = Number(base.active ?? 0); // นับแยกจาก dissolved เพื่อให้ตรวจผลรวมได้จริง
  const last12 = Number(base.last12 ?? 0);
  const prev12 = Number(base.prev12 ?? 0);
  const lastYear = Number(asOf.slice(0, 4));
  const partial = asOf.slice(5, 10) !== "12-31";

  const lines: string[] = [
    `ขอบเขตข้อมูล: นิติบุคคลประเภทธุรกิจ (TSIC) ${seg.tsic} "${tsicName}" ${where2} ที่จดทะเบียนใหม่ระหว่าง ${fromTh} ถึง ${toTh} จากข้อมูลเปิดของกรมพัฒนาธุรกิจการค้า`,
    `จดทะเบียนใหม่รวม ${num(n)} ราย ปัจจุบันยังไม่ปรากฏว่าเลิกกิจการ ${num(active)} ราย (${pct(active, n)}) เลิกกิจการแล้ว ${num(dissolved)} ราย (${pct(dissolved, n)})`,
    `จำนวนจดทะเบียนใหม่รายปี: ${years
      .map((y) => `ปี ${Number(y.y) + 543}${Number(y.y) === lastYear && partial ? ` (ถึง ${toTh})` : ""} ${num(Number(y.n))} ราย`)
      .join(", ")}`,
    ...yearComparisons(years, lastYear, partial, toTh),
    `12 เดือนล่าสุด (ถึง ${toTh}) จดทะเบียนใหม่ ${num(last12)} ราย เทียบกับ 12 เดือนก่อนหน้า ${num(prev12)} ราย${
      prev12 > 0
        ? last12 === prev12
          ? " (เท่ากัน)"
          : ` (${last12 > prev12 ? "เพิ่มขึ้น" : "ลดลง"} ${pct(Math.abs(last12 - prev12), prev12)})`
        : ""
    }`,
    `รูปแบบนิติบุคคล: ${types.map((t) => `${t.t} ${num(Number(t.n))} ราย (${pct(Number(t.n), n)})`).join(", ")}`,
    `ทุนจดทะเบียน: ค่ากลาง (มัธยฐาน) ${baht(Number(q?.med ?? 0))} ช่วงกลางของกลุ่ม (ควอร์ไทล์ที่ 1–3) ${baht(Number(q?.p25 ?? 0))} ถึง ${baht(Number(q?.p75 ?? 0))} ทุนที่พบบ่อยที่สุดคือ ${baht(Number(mode?.c ?? 0))} (${num(Number(mode?.n ?? 0))} ราย)`,
    `สัดส่วนตามขนาดทุน: ต่ำกว่า 1 ล้านบาท ${num(Number(brackets[0]?.small ?? 0))} ราย (${pct(Number(brackets[0]?.small ?? 0), n)}), 1 ถึงต่ำกว่า 5 ล้านบาท ${num(Number(brackets[0]?.mid ?? 0))} ราย (${pct(Number(brackets[0]?.mid ?? 0), n)}), 5 ล้านบาทขึ้นไป ${num(Number(brackets[0]?.big ?? 0))} ราย (${pct(Number(brackets[0]?.big ?? 0), n)})`,
    `${seg.province ? "อำเภอ/เขตที่จดทะเบียนมากที่สุด" : "จังหวัดที่จดทะเบียนมากที่สุด"}: ${geo.map((g) => `${g.g} ${num(Number(g.n))} ราย`).join(", ")}`,
    `ในกลุ่มที่ยังไม่เลิกกิจการ พบในรายชื่อผู้จดทะเบียนภาษีมูลค่าเพิ่มของกรมสรรพากร ${num(Number(vat?.n ?? 0))} ราย (${pct(Number(vat?.n ?? 0), active)} ของ ${num(active)} ราย)`,
    Number(gov?.winners ?? 0) > 0
      ? `ในกลุ่มที่ยังไม่เลิกกิจการ เคยได้งานจัดซื้อจัดจ้างภาครัฐ (ข้อมูล e-GP) ${num(Number(gov.winners))} ราย รวม ${num(Number(gov.contracts))} สัญญา`
      : `ในกลุ่มที่ยังไม่เลิกกิจการ ยังไม่พบรายใดในข้อมูลผู้ได้งานจัดซื้อจัดจ้างภาครัฐ (e-GP)`,
    Number(tisi?.n ?? 0) > 0
      ? `ในกลุ่มที่ยังไม่เลิกกิจการ ได้รับใบอนุญาตมาตรฐานผลิตภัณฑ์อุตสาหกรรม (มอก.) ${num(Number(tisi.n))} ราย`
      : `ในกลุ่มที่ยังไม่เลิกกิจการ ยังไม่พบรายใดในข้อมูลใบอนุญาต มอก.`,
  ];
  if (seg.province) {
    const total = natRank.reduce((s, r) => s + Number(r.n), 0);
    const rank = natRank.findIndex((r) => r.p === seg.province) + 1;
    if (total && rank) lines.push(`เทียบทั้งประเทศ: ประเภทธุรกิจนี้จดทะเบียนใหม่ทั่วประเทศ ${num(total)} ราย ${seg.province} คิดเป็น ${pct(n, total)} อยู่อันดับที่ ${rank} จาก ${natRank.length} จังหวัด`);
  }

  // ตรวจความสอดคล้องของตัวเลขก่อนส่งให้ AI — ถ้าขัดกันเองแปลว่า query/ข้อมูลผิด ห้ามเขียนบทความ
  const sum = (rows: RowDataPacket[]) => rows.reduce((a, r) => a + Number(r.n), 0);
  const bk = brackets[0] ?? {};
  const med = Number(q?.med ?? 0);
  const raw = {
    n,
    active,
    dissolved,
    yearsSum: sum(years),
    typesSum: sum(types),
    bracketsSum: Number(bk.small ?? 0) + Number(bk.mid ?? 0) + Number(bk.big ?? 0),
    p25: Number(q?.p25 ?? 0),
    med,
    p75: Number(q?.p75 ?? 0),
    modeN: Number(mode?.n ?? 0),
    geo: geo.map((g) => Number(g.n)),
    vat: Number(vat?.n ?? 0),
    govWinners: Number(gov?.winners ?? 0),
    tisi: Number(tisi?.n ?? 0),
    last12,
    prev12,
  };
  const problems = factProblems(raw);
  if (problems.length) throw new Error(`ข้อมูลไม่สอดคล้องกัน — ไม่เขียนบทความ: ${problems.join("; ")}`);

  const table = [
    { label: "ช่วงข้อมูล", value: `จดทะเบียน ${fromTh} – ${toTh}` },
    { label: "จดทะเบียนใหม่", value: `${num(n)} ราย` },
    { label: "12 เดือนล่าสุด", value: `${num(last12)} ราย` + (prev12 ? ` (ก่อนหน้า ${num(prev12)} ราย)` : "") },
    { label: "เลิกกิจการแล้ว", value: `${num(dissolved)} ราย (${pct(dissolved, n)})` },
    { label: "ทุนจดทะเบียนค่ากลาง", value: baht(Number(q?.med ?? 0)) },
    { label: "จด VAT (ที่ยังดำเนินกิจการ)", value: `${num(Number(vat?.n ?? 0))} ราย (${pct(Number(vat?.n ?? 0), active)})` },
    { label: seg.province ? "เขต/อำเภอที่มากที่สุด" : "จังหวัดที่มากที่สุด", value: geo[0] ? `${geo[0].g} (${num(Number(geo[0].n))} ราย)` : "-" },
  ];
  const allowed = new Set([...lines, ...table.map((t) => `${t.label} ${t.value}`)].flatMap(numbersIn));
  // ตัวเลขทั่วไปที่ไม่ใช่ข้อเท็จจริงเชิงสถิติ (เช่น "13 หลัก", "12 เดือน", "ขั้นตอนที่ 3")
  for (const x of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "13"]) allowed.add(x);

  return {
    key: segmentKey(seg),
    slug: segmentSlug(seg),
    segment: seg,
    tsicName,
    subject,
    lines,
    table,
    source: `ตัวเลขทั้งหมดเป็นของนิติบุคคลที่จดทะเบียนใหม่ระหว่าง ${fromTh} – ${toTh} เท่านั้น ไม่ใช่จำนวนกิจการทั้งหมดในประเทศ · ที่มา: ข้อมูลเปิดนิติบุคคลจดทะเบียนใหม่/เลิกกิจการ กรมพัฒนาธุรกิจการค้า, รายชื่อผู้จดทะเบียน VAT กรมสรรพากร, e-GP กรมบัญชีกลาง, ใบอนุญาต มอก. สมอ. — ประมวลผลโดย ThaiDataCorp ข้อมูลถึง ${toTh}`,
    links: [
      { href: `/tsic/${seg.tsic}${seg.province ? `/${encodeURIComponent(seg.province)}` : ""}`, label: `รายชื่อนิติบุคคล${subject}` },
      { href: `/search`, label: "ค้นหาและกรองรายชื่อบริษัท (Lead Finder)" },
    ],
    allowed,
    raw,
    trend: {
      years: years.map((y) => ({ be: Number(y.y) + 543, n: Number(y.n), full: !(partial && Number(y.y) === lastYear) })),
      last12,
      prev12,
    },
  };
}
