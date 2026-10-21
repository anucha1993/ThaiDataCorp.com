/**
 * ตรวจ "ข้อความเชิงเปรียบเทียบ" ในบทความสถิติแบบตายตัว (ไม่ใช้ AI) — กันจุดที่ AI ผิดบ่อยที่สุด:
 *   - ทิศทางรายปีผิด ("ปี 2568 ลดลงจากปี 2567" ทั้งที่เพิ่มขึ้น)
 *   - ปีสูงสุด/ต่ำสุดผิด
 *   - เอาปีที่ยังไม่ครบปีไปเทียบกับปีเต็ม
 *   - ทิศทาง 12 เดือนล่าสุดผิด
 *   - อ้าง "ต่อเนื่อง" ทั้งที่ข้อมูลไม่ได้เพิ่ม/ลดทุกปี
 * กติกาเข้มไว้ก่อน: ถ้าอ่านแล้วไม่ตรงข้อมูล → ตัดย่อหน้านั้น (ตัดเกินดีกว่าปล่อยข้อมูลผิด)
 */

export interface TrendData {
  /** ปี พ.ศ. → จำนวน · full = มีข้อมูลครบทั้งปี */
  years: Array<{ be: number; n: number; full: boolean }>;
  last12: number;
  prev12: number;
}

type Dir = "up" | "down" | "same";
const UP = /(เพิ่มขึ้น|เพิ่มเป็น|สูงขึ้น|มากขึ้น|ขยับขึ้น|ปรับตัวขึ้น|ปรับขึ้น)/;
const DOWN = /(ลดลง|ลดเป็น|ต่ำลง|น้อยลง|หดตัว|ปรับตัวลง|ปรับลง)/;
const dirOf = (w: string): Dir | null => (UP.test(w) ? "up" : DOWN.test(w) ? "down" : /เท่าเดิม|ทรงตัว/.test(w) ? "same" : null);
const dirThai = { up: "เพิ่มขึ้น", down: "ลดลง", same: "เท่าเดิม" } as const;

/** ไม่ข้ามคำว่า "ปี" ตัวถัดไป (ให้แต่ละปีจับคู่กับคำบรรยายของตัวเอง) */
const GAP = (n: number) => `(?:(?!ปี\\s*\\d)[\\s\\S]){0,${n}}`;

/** คืนเหตุผลถ้าข้อความขัดกับข้อมูล · null = ผ่าน */
export function checkTrendClaims(text: string, t: TrendData): string | null {
  const year = new Map(t.years.map((y) => [y.be, y]));
  const full = t.years.filter((y) => y.full);
  const max = full.length >= 2 ? full.reduce((a, b) => (b.n > a.n ? b : a)) : null;
  const min = full.length >= 2 ? full.reduce((a, b) => (b.n < a.n ? b : a)) : null;
  const actual = (a: number, b: number): Dir => (a > b ? "up" : a < b ? "down" : "same");

  // 1) "ปี A ... เพิ่มขึ้น/ลดลง ... จากปี B"
  for (const m of text.matchAll(new RegExp(`ปี\\s*(25\\d\\d)${GAP(60)}?(เพิ่ม\\S*|ลด\\S*|สูงขึ้น|ต่ำลง|มากขึ้น|น้อยลง|เท่าเดิม|ทรงตัว)${GAP(20)}?จาก(?:ช่วง)?(?:ปี)?\\s*(25\\d\\d)`, "g"))) {
    const a = year.get(Number(m[1]));
    const b = year.get(Number(m[3]));
    const d = dirOf(m[2]);
    if (!a || !b || !d) continue;
    if (!a.full || !b.full) return `เทียบปีที่ยังไม่ครบปี (ปี ${!a.full ? a.be : b.be})`;
    if (actual(a.n, b.n) !== d) return `ปี ${a.be} ${dirThai[actual(a.n, b.n)]}จากปี ${b.be} ไม่ใช่${dirThai[d]}`;
  }

  // 2) "เพิ่มขึ้น/ลดลง ... ในปี A" (ไม่มีคำว่า "จาก" คั่น) → เทียบกับปีก่อนหน้า
  for (const m of text.matchAll(new RegExp(`(เพิ่มขึ้น|ลดลง|เพิ่มเป็น|ลดเป็น)(?:(?!ปี\\s*\\d|จาก)[\\s\\S]){0,25}ปี\\s*(25\\d\\d)`, "g"))) {
    const a = year.get(Number(m[2]));
    const prev = year.get(Number(m[2]) - 1);
    const d = dirOf(m[1]);
    if (!a || !prev || !d) continue;
    if (!a.full || !prev.full) return `เทียบปีที่ยังไม่ครบปี (ปี ${!a.full ? a.be : prev.be})`;
    if (actual(a.n, prev.n) !== d) return `ปี ${a.be} ${dirThai[actual(a.n, prev.n)]}จากปีก่อนหน้า ไม่ใช่${dirThai[d]}`;
  }

  // 2b) "ปี A … ลดลง/เพิ่มขึ้น" (ไม่มีคำว่า "จาก" ตามมา และไม่ได้พูดถึงช่วงเดือน) → เทียบกับปีก่อนหน้า
  //     ช่วงปี ("ตั้งแต่ปี A ถึง B … ต่อเนื่อง") ไม่ใช่การเทียบปีเดียว — กฎ 4 ตรวจแทน
  for (const m of text.matchAll(/ปี\s*(25\d\d)((?:(?!ปี\s*\d|25\d\d|เดือน|จาก|ถึง)[\s\S]){0,40}?)(เพิ่มขึ้น|ลดลง|เพิ่มเป็น|ลดเป็น)(?![\s\S]{0,25}จาก)(?!\S{0,6}(?:อย่าง)?ต่อเนื่อง)/g)) {
    const a = year.get(Number(m[1]));
    const prev = year.get(Number(m[1]) - 1);
    const d = dirOf(m[3]);
    if (!a || !d) continue;
    if (!a.full) return `เทียบปีที่ยังไม่ครบปี (ปี ${a.be})`;
    if (prev?.full && actual(a.n, prev.n) !== d) return `ปี ${a.be} ${dirThai[actual(a.n, prev.n)]}จากปีก่อนหน้า ไม่ใช่${dirThai[d]}`;
  }

  // 3) ปีสูงสุด/ต่ำสุด — อ่านรูป "…ที่สุดคือปี A" ก่อนแล้วลบออก ค่อยอ่านรูป "ปี A … ที่สุด"
  //    (กันจับคู่ข้ามกัน เช่น "มากที่สุดคือปี 2568 (5,576 ราย) น้อยที่สุดคือปี 2566")
  const reversed = /(มากที่สุด|สูงสุด|สูงที่สุด|น้อยที่สุด|ต่ำสุด|ต่ำที่สุด)\s*(?:คือ|ได้แก่|เป็น|อยู่ที่)?\s*(?:ใน)?ปี\s*(25\d\d)/g;
  const extremes = [...text.matchAll(reversed)].map((m) => [m[2], m[1]]);
  const rest = text.replace(reversed, (m) => " ".repeat(m.length));
  for (const m of rest.matchAll(/ปี\s*(25\d\d)(?:(?!ปี\s*\d|ที่สุด|สูงสุด|ต่ำสุด)[\s\S]){0,50}?(มากที่สุด|สูงสุด|สูงที่สุด|น้อยที่สุด|ต่ำสุด|ต่ำที่สุด)/g)) {
    extremes.push([m[1], m[2]]);
  }
  for (const [y, w] of extremes) {
    const a = year.get(Number(y));
    if (!a || !max || !min) continue;
    const isMax = /มาก|สูง/.test(w);
    if (!a.full) return `ปี ${a.be} ยังไม่ครบปี จึงไม่ควรบอกว่า${w}`;
    if (isMax && a.be !== max.be) return `ปีที่มากที่สุดคือ ${max.be} ไม่ใช่ ${a.be}`;
    if (!isMax && a.be !== min.be) return `ปีที่น้อยที่สุดคือ ${min.be} ไม่ใช่ ${a.be}`;
  }

  // 4) "ต่อเนื่อง" — ต้องเพิ่ม/ลดทุกปีในช่วงที่อ้าง (ปีที่กล่าวถึงจนถึงปีเต็มล่าสุด)
  const cont = text.match(/(เพิ่มขึ้น|ลดลง|เติบโต|หดตัว)\S{0,6}(?:อย่าง)?ต่อเนื่อง/);
  if (cont) {
    const d = dirOf(cont[1]) ?? (/เติบโต/.test(cont[1]) ? "up" : "down");
    const mentioned = [...text.matchAll(/ปี\s*(25\d\d)/g)].map((m) => Number(m[1])).filter((y) => year.get(y)?.full);
    if (!mentioned.length) return `อ้างว่า${cont[0]} แต่ไม่ได้ระบุช่วงปี`;
    const from = Math.min(...mentioned);
    const to = mentioned.length > 1 ? Math.max(...mentioned) : Math.max(...full.map((y) => y.be));
    const span = full.filter((y) => y.be >= from && y.be <= to);
    if (span.length < 2) return `อ้างว่า${cont[0]} แต่ข้อมูลมีไม่ถึง 2 ปี`;
    for (let i = 1; i < span.length; i++) {
      if (actual(span[i].n, span[i - 1].n) !== d) return `ปี ${span[i].be} ${dirThai[actual(span[i].n, span[i - 1].n)]} ไม่ได้${dirThai[d]}ต่อเนื่อง`;
    }
  }

  // 5) ทิศทาง 12 เดือนล่าสุด
  if (/12\s*เดือน/.test(text) && t.prev12 > 0) {
    const m = text.match(new RegExp(`12\\s*เดือน${GAP(120)}?(เพิ่มขึ้น|ลดลง|สูงขึ้น|ต่ำลง|มากขึ้น|น้อยลง)`));
    const d = m ? dirOf(m[1]) : null;
    if (d && !/จาก(?:ปี)?\s*25\d\d/.test(m![0]) && actual(t.last12, t.prev12) !== d) {
      return `12 เดือนล่าสุด${dirThai[actual(t.last12, t.prev12)]} ไม่ใช่${dirThai[d]}`;
    }
  }
  return null;
}

/** คำที่เป็นการตีความเกินข้อมูล (ถ้าไม่มีคำปฏิเสธนำหน้า) — ตรงกับ DATA_CAVEATS ใน lib/ai-articles */
const OVERREACH = [
  "น่าเชื่อถือ",
  "ความเชื่อมั่น",
  "ปฏิบัติตามกฎหมาย",
  "มั่นคง",
  "ประสบความสำเร็จ",
  "อยู่รอด",
  "ศักยภาพ",
  "ความต้องการของตลาด",
  "ความต้องการในตลาด",
  "ความต้องการสูง",
  "โอกาสทางธุรกิจ",
  "ขนาดตลาด",
  "ผู้นำตลาด",
  "ครองตลาด",
  "คุณภาพ",
  "เศรษฐกิจ",
  "โควิด",
  "นักท่องเที่ยว",
  "การท่องเที่ยว",
  "นโยบาย",
];
const NEGATION = /(ไม่|มิได้|ห้าม|อย่า)/;
/** วลีที่มีคำว่า "ไม่" แต่ไม่ใช่การปฏิเสธข้อสรุป — ตัดออกก่อนหาคำปฏิเสธ */
const NOT_NEGATION = /(ยังไม่ปรากฏว่าเลิกกิจการ|ยังไม่ปรากฏ|ยังไม่เลิกกิจการ|ไม่เลิกกิจการ|ยังไม่ครบปี|ไม่ครบปี)/g;

/** ตรวจถ้อยคำ — คืนเหตุผลถ้าไม่ผ่าน */
export function checkWording(text: string): string | null {
  if (/https?:|www\.|\*\*|`|^#|\[|\]/.test(text)) return "มีลิงก์หรือ Markdown";
  // ชื่อบริษัท เช่น "บริษัท เอ บี ซี จำกัด" (ไม่นับ "บริษัทจำกัด"/"บริษัทมหาชนจำกัด" ที่เป็นรูปแบบนิติบุคคล)
  if (/บริษัท\s+(?:(?!บริษัท)[^\s,]{1,25}\s+){1,3}จำกัด(?![ก-๙])/.test(text) || /(?:หจก\.|บจก\.|บมจ\.)\s*\S/.test(text)) return "อาจมีชื่อบริษัท";
  for (const w of OVERREACH) {
    let i = text.indexOf(w);
    while (i >= 0) {
      // มีคำปฏิเสธในช่วง 40 ตัวอักษรก่อนหน้า = กำลังบอกว่า "ไม่ได้หมายถึง..." → ผ่าน
      const before = text.slice(Math.max(0, i - 35), i).replace(NOT_NEGATION, "");
      if (!NEGATION.test(before)) return `ตีความเกินข้อมูล ("${w}")`;
      i = text.indexOf(w, i + w.length);
    }
  }
  return null;
}

/** ตรวจครบทุกกฎแบบตายตัว */
export const checkClaims = (text: string, t: TrendData) => checkTrendClaims(text, t) ?? checkWording(text);
