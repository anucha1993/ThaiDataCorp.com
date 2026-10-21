/**
 * ทดสอบระบบบทความอัตโนมัติหลายแบบ — รันก่อน deploy ทุกครั้งที่แก้ lib/ai-*.ts
 *
 *   npm run test:ai            # ทุกชุด (ไม่เรียก OpenAI จริง — ใช้ AI จำลอง)
 *   npm run test:ai -- --quick # ข้ามชุดตรวจข้อมูลจริงจากฐานข้อมูล (C)
 *
 * A. กฎตายตัว: ตัวเลข / ทิศทาง / ปีสูงสุด / ปีไม่ครบ / 12 เดือน / คำตีความเกิน / ชื่อบริษัท / ความสอดคล้องของข้อมูล
 *    (รวมข้อผิดพลาดจริงที่ AI เคยเขียนตอนทดสอบ)
 * B. ทั้งกระบวนการกับ AI จำลองที่ตั้งใจตอบผิดหลายแบบ — ต้องถูกตัดทิ้งหรือปฏิเสธทุกกรณี
 * C. ตรวจข้อเท็จจริงจากฐานข้อมูลจริง: คำนวณซ้ำด้วยโค้ดอีกชุด (อ่านแถวดิบแล้วนับใน JS) ต้องตรงกับที่ส่งให้ AI
 * D. บันทึก/เผยแพร่: ฉบับร่างต้องไม่โผล่บนเว็บ (ใช้แถวทดสอบของตัวเองแล้วลบทิ้ง)
 * E. แสดงผล: ข้อความจาก AI ต้องถูก escape ไม่มี HTML แปลกปลอม
 */
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const QUICK = process.argv.includes("--quick");

let pass = 0;
const fails: string[] = [];
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fails.push(name);
    console.log(`  ✖ ${name}\n      ${(e as Error).message.split("\n").join("\n      ")}`);
  }
}

async function main() {
  const ai = await import("@/lib/ai-articles");
  const facts = await import("@/lib/ai-data-facts");
  const claims = await import("@/lib/ai-claims");
  const { closePool, dbQuery } = await import("@/lib/db");

  // ข้อมูลสมมติ (ตัวเลขชุดเดียวกับธุรกิจก่อสร้างจริง) — ไม่พึ่งฐานข้อมูล ผลจึงคงที่
  const trend = {
    years: [
      { be: 2565, n: 5249, full: true },
      { be: 2566, n: 4324, full: true },
      { be: 2567, n: 4690, full: true },
      { be: 2568, n: 5576, full: true },
      { be: 2569, n: 1668, full: false },
    ],
    last12: 3680,
    prev12: 5362,
  };
  const lines = [
    "จดทะเบียนใหม่รวม 21,507 ราย ยังไม่ปรากฏว่าเลิกกิจการ 19,976 ราย (ร้อยละ 92.9) เลิกกิจการแล้ว 1,531 ราย (ร้อยละ 7.1)",
    "รายปี: ปี 2565 5,249 ราย, ปี 2566 4,324 ราย, ปี 2567 4,690 ราย, ปี 2568 5,576 ราย, ปี 2569 (ถึง ก.ค. 2569) 1,668 ราย",
    "12 เดือนล่าสุด 3,680 ราย เทียบกับ 12 เดือนก่อนหน้า 5,362 ราย (ลดลง ร้อยละ 31.4)",
    "กรุงเทพมหานคร 3,029 ราย, ชลบุรี 1,424 ราย ทุนค่ากลาง 1 ล้านบาท จด VAT 12,951 ราย (ร้อยละ 64.8)",
  ];
  const allowed = new Set([...lines.flatMap(facts.numbersIn), "1", "2", "3", "4", "5", "12", "13"]);
  const fakeFacts = {
    key: "tsic:00000",
    slug: "business-stats-00000",
    segment: { tsic: "00000", province: null },
    tsicName: "ทดสอบ",
    subject: "ธุรกิจทดสอบ ทั่วประเทศ",
    lines,
    table: [{ label: "จดทะเบียนใหม่", value: "21,507 ราย" }],
    source: "ที่มา: ทดสอบ",
    links: [],
    allowed,
    trend,
    raw: {} as never,
  };
  const check = (t: string) => claims.checkClaims(t, trend);

  console.log("\nA. กฎตายตัว");
  await test("ตัวเลขไทย/จุลภาค/ทศนิยม ถูกดึงออกมาถูกต้อง", () => {
    assert.deepEqual(facts.numbersIn("รวม ๒๑,๕๐๗ ราย ร้อยละ 92.9 ทุน 1,000,000 บาท"), ["21507", "92.9", "1000000"]);
  });
  await test("ตัวเลขที่ไม่มีในข้อมูล → ตัดย่อหน้า (AI คำนวณร้อยละเอง)", () => {
    const r = ai.verifyNumbers([{ heading: "ทุน", paragraphs: ["ทุน 1 ล้านบาท มี 13,048 ราย คิดเป็นร้อยละ 60.7", "รวม 21,507 ราย"] }], allowed);
    assert.equal(r.sections[0].paragraphs.length, 1);
    assert.equal(r.dropped.length, 1);
    assert.ok(r.dropped[0].includes("13048") && r.dropped[0].includes("60.7"), "ต้องระบุตัวเลขที่ไม่ตรงทั้งสองตัว");
  });
  await test("ปี ค.ศ. ถูกจับ (ข้อมูลเป็น พ.ศ.)", () => {
    const r = ai.verifyNumbers([{ heading: "x", paragraphs: ["ในปี 2025 มี 5,576 ราย"] }], allowed);
    assert.equal(r.sections.length, 0);
  });

  const BAD: Array<[string, string]> = [
    // ข้อผิดพลาดจริงจาก gpt-4o-mini
    ["ปี 2565 มีการจดทะเบียนใหม่สูงสุดที่ 5,249 ราย", "ปีสูงสุดผิด (จริงคือ 2568)"],
    ["แต่กลับลดลงอีกครั้งในปี 2568 ที่มีการจดทะเบียนใหม่ 5,576 ราย", "ทิศทางผิด (2568 เพิ่มขึ้น)"],
    ["ปี 2568 ลดลงจากปี 2567", "ทิศทางผิดแบบมีคำว่าจาก"],
    ["ปี 2566 เพิ่มขึ้นจากปี 2565", "ทิศทางผิด (2566 ลดลง)"],
    ["ปี 2569 ลดลงจากปี 2568 เหลือ 1,668 ราย", "เทียบปีที่ไม่ครบ"],
    ["ในปี 2569 จำนวนการจดทะเบียนใหม่ลดลงอีกครั้งเหลือ 1,668 ราย", "เทียบปีที่ไม่ครบแบบไม่มีคำว่าจาก"],
    ["ปีที่น้อยที่สุดคือปี 2565", "ปีต่ำสุดผิด (จริงคือ 2566)"],
    ["ปี 2569 มีการจดทะเบียนน้อยที่สุด", "เรียกปีไม่ครบว่าน้อยที่สุด"],
    ["ในช่วง 12 เดือนล่าสุด มีการจดทะเบียนใหม่ 3,680 ราย เพิ่มขึ้นอย่างต่อเนื่อง", "12 เดือนจริงลดลง / ต่อเนื่องไม่มีช่วงปี"],
    ["12 เดือนล่าสุดจดทะเบียนใหม่ 3,680 ราย เพิ่มขึ้นจาก 5,362 ราย", "12 เดือนทิศทางผิด"],
    ["ตั้งแต่ปี 2565 ถึง 2568 จำนวนจดทะเบียนเพิ่มขึ้นอย่างต่อเนื่อง", "อ้างต่อเนื่องแต่ 2566 ลดลง"],
    ["จด VAT ร้อยละ 64.8 แสดงถึงระดับการปฏิบัติตามกฎหมายที่ดี", "ตีความ VAT เกิน"],
    ["สัดส่วนที่ยังไม่เลิกกิจการสูงเป็นสัญญาณความมั่นคงของธุรกิจ", "ตีความเกิน (มั่นคง)"],
    ["การได้ มอก. อาจช่วยเพิ่มความน่าเชื่อถือให้กับธุรกิจ", "ตีความเกินแม้มีคำว่าอาจ"],
    ["กรุงเทพฯ มีจำนวนมากเพราะมีนักท่องเที่ยวมาก", "อ้างสาเหตุ"],
    ["อาจสะท้อนการฟื้นตัวของเศรษฐกิจหลังโควิด", "อ้างสาเหตุเศรษฐกิจ"],
    ["เช่น บริษัท เอบีซี คอนสตรัคชั่น จำกัด ได้งานภาครัฐมาก", "ชื่อบริษัท"],
    ["รายใหญ่อย่าง บริษัท ปตท. จำกัด (มหาชน)", "ชื่อบริษัทมหาชน"],
    ["เช่น หจก. สมชายก่อสร้าง", "ชื่อห้างหุ้นส่วนแบบย่อ"],
    ["ดูรายละเอียดที่ https://example.com", "ลิงก์"],
    ["**สรุป** ธุรกิจนี้น่าสนใจ", "Markdown"],
  ];
  for (const [t, why] of BAD) await test(`ต้องจับ: ${why}`, () => assert.ok(check(t), `ไม่ถูกจับ: "${t}"`));

  const GOOD: Array<[string, string]> = [
    ["ปี 2568 เป็นปีที่มีการจดทะเบียนใหม่มากที่สุด 5,576 ราย", "ปีสูงสุดถูก"],
    ["ปีที่น้อยที่สุดคือปี 2566 จำนวน 4,324 ราย", "ปีต่ำสุดถูก"],
    ["ปี 2566 ลดลงจากปี 2565 ส่วนปี 2567 เพิ่มขึ้นจากปี 2566 และปี 2568 เพิ่มขึ้นจากปี 2567", "ทิศทางถูกหลายคู่"],
    ["12 เดือนล่าสุดมี 3,680 ราย เทียบกับ 12 เดือนก่อนหน้า 5,362 ราย ลดลง ร้อยละ 31.4", "12 เดือนถูก"],
    ["ตั้งแต่ปี 2566 ถึง 2568 จำนวนจดทะเบียนใหม่เพิ่มขึ้นอย่างต่อเนื่อง", "ต่อเนื่องถูก (2566→2567→2568 เพิ่ม)"],
    ["ปี 2569 มีข้อมูลถึง ก.ค. 2569 เท่านั้น จึงไม่ควรเทียบกับปีเต็ม", "พูดถึงปีไม่ครบอย่างถูกต้อง"],
    ["ตัวเลข VAT ไม่ได้บอกความน่าเชื่อถือของกิจการ", "คำปฏิเสธนำหน้า"],
    ["รูปแบบที่พบมากที่สุดคือบริษัทจำกัด 13,725 ราย และบริษัทมหาชนจำกัด 2 ราย", "รูปแบบนิติบุคคล ไม่ใช่ชื่อบริษัท"],
    ["กรุงเทพมหานครมีจำนวนจดทะเบียนใหม่มากที่สุด 3,029 ราย", "อันดับพื้นที่ (ไม่ใช่ปี)"],
    // ข้อความจริงจาก gpt-5.4-mini ที่กฎเคยตัดผิด
    ["ถ้าจะวางโครงสร้างบริษัท ข้อมูลรูปแบบนิติบุคคลและช่วงทุนจดทะเบียนที่พบมากช่วยเป็นจุดตั้งต้นได้ โดยกลุ่มนี้ส่วนใหญ่เป็นบริษัทจำกัด และ", "คำว่าบริษัททั่วไป ไม่ใช่ชื่อบริษัท"],
    ["ในบรรดาปีที่มีข้อมูลครบทั้งปี ปีที่จดทะเบียนใหม่มากที่สุดคือปี 2568 (5,576 ราย) น้อยที่สุดคือปี 2566 (4,324 ราย)", "ประโยคสูงสุด+ต่ำสุดในประโยคเดียว"],
    ["เมื่อดูสถานะปัจจุบัน ยังไม่ปรากฏว่าเลิกกิจการ 19,976 ราย ซึ่งไม่ได้บอกว่าธุรกิจมั่นคง", "ยังไม่ปรากฏ + คำปฏิเสธจริง"],
    ["ช่วงปี 2566 ถึง 2568 จำนวนการจดทะเบียนใหม่เพิ่มขึ้นต่อเนื่องจาก 4,324 ราย เป็น 4,690 ราย และ 5,576 ราย", "ต่อเนื่องแบบมีตัวเลขเรียง"],
  ];
  for (const [t, why] of GOOD) await test(`ต้องผ่าน: ${why}`, () => assert.equal(check(t), null, `ถูกตัดผิด: ${check(t)}`));

  await test("ตรวจความสอดคล้องของข้อมูล: ข้อมูลดีผ่าน / ข้อมูลขัดกันถูกจับทุกกฎ", () => {
    const ok = { n: 100, active: 90, dissolved: 10, yearsSum: 100, typesSum: 100, bracketsSum: 100, p25: 1, med: 2, p75: 3, modeN: 40, geo: [50, 20], vat: 50, govWinners: 5, tisi: 1, last12: 30, prev12: 25 };
    assert.deepEqual(facts.factProblems(ok), []);
    for (const bad of [{ active: 95 }, { yearsSum: 99 }, { typesSum: 101 }, { bracketsSum: 98 }, { p25: 5 }, { modeN: 101 }, { geo: [20, 50] }, { vat: 91 }, { last12: 101 }]) {
      assert.ok(facts.factProblems({ ...ok, ...bad }).length > 0, `ไม่จับ ${JSON.stringify(bad)}`);
    }
  });
  await test("sanitize: ตัด < > กันโค้ดแปลกปลอม, บทความสั้นถูกปฏิเสธ, นอกขอบเขตโยน error", () => {
    const long = "ข้อความยาวพอสำหรับย่อหน้าทดสอบ ".repeat(30);
    const r = ai.sanitizeArticle({ in_scope: true, title: "หัว<script>", description: "x", category: "แปลก", slug: "Hello World!!", sections: [1, 2, 3].map(() => ({ heading: "h", paragraphs: [long + "<img onerror=x>"] })) });
    assert.ok(r && !/[<>]/.test(JSON.stringify(r)));
    assert.equal(r!.slug, "hello-world");
    assert.equal(r!.category, "ทำธุรกิจ");
    assert.equal(ai.sanitizeArticle({ in_scope: true, title: "a", description: "b", sections: [{ heading: "h", paragraphs: ["สั้น"] }] }), null);
    assert.throws(() => ai.sanitizeArticle({ in_scope: false, reason: "การพนัน" }), ai.OutOfScopeError);
  });

  console.log("\nB. ทั้งกระบวนการกับ AI จำลองที่ตอบผิด");
  // AI จำลอง: ตอบตาม scenario ที่ตั้งไว้ แยกตามชนิดคำขอ (วางโครง / เขียนหัวข้อย่อย / fact-check)
  type Scenario = {
    status?: number;
    raw?: string;
    outline?: Record<string, unknown>;
    section?: (heading: string) => Record<string, unknown>;
    factcheck?: Record<string, unknown>;
  };
  let scenario: Scenario = {};
  const requests: Array<Record<string, unknown>> = [];
  const server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      const j = JSON.parse(b);
      requests.push(j);
      const sys: string = j.messages[0].content;
      const user: string = j.messages[1].content;
      if (scenario.status) {
        res.writeHead(scenario.status, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Rate limit reached" } }));
      }
      let out: unknown;
      if (sys.includes("fact-checker")) out = scenario.factcheck ?? { problems: [] };
      else if (sys.includes("วางโครง")) out = scenario.outline ?? GOOD_OUTLINE;
      else out = (scenario.section ?? goodSection)(user.match(/หัวข้อย่อยที่ต้องเขียน: (.*)/)?.[1] ?? "");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: scenario.raw ?? JSON.stringify(out) } }], usage: { total_tokens: 100 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const cfg = { enabled: true, apiKey: "sk-test", model: "gpt-4o-mini", autoPublish: false, mode: "data" as const };

  const GOOD_OUTLINE = {
    title: "สถิติธุรกิจทดสอบ ทั่วประเทศ",
    description: "สรุปการจดทะเบียนใหม่ ทุน และพื้นที่",
    sections: ["ภาพรวม", "แนวโน้มรายปี", "ช่วงล่าสุด", "พื้นที่"].map((h) => ({ heading: h, points: ["ประเด็น"] })),
  };
  const filler = "ข้อมูลนี้ใช้เป็นจุดเริ่มต้นในการค้นหาคู่ค้าและตรวจสอบสถานะบริษัทในกลุ่มเดียวกันได้ โดยควรกรองตามจังหวัดและประเภทธุรกิจก่อน แล้วตรวจสถานะล่าสุดของแต่ละรายประกอบ ";
  const goodSection = (h: string) => ({
    paragraphs: [
      `${h}: จดทะเบียนใหม่รวม 21,507 ราย ยังไม่ปรากฏว่าเลิกกิจการ 19,976 ราย ${filler}`,
      `ปี 2568 เป็นปีที่มากที่สุด 5,576 ราย และปี 2566 น้อยที่สุด 4,324 ราย ${filler}`,
      `${filler}${filler}`,
    ],
  });
  const run = () => ai.writeDataArticle(cfg, fakeFacts);

  await test("บทความถูกต้อง → ผ่านครบ ไม่ตัดอะไร", async () => {
    scenario = {};
    const r = await run();
    assert.ok(r.article);
    assert.equal(r.check?.dropped.length, 0);
    assert.equal(r.article.category, "สถิติธุรกิจ");
    assert.equal(r.article.slug, "business-stats-00000");
  });
  await test("แต่งตัวเลขในบางย่อหน้า → ตัดเฉพาะย่อหน้านั้น ที่เหลือเก็บไว้", async () => {
    scenario = { section: (h) => ({ paragraphs: [...goodSection(h).paragraphs, "กลุ่มนี้มีรายได้รวม 9,999 ล้านบาท"] }) };
    const r = await run();
    assert.equal(r.check?.dropped.length, 4);
    assert.ok(!JSON.stringify(r.article).includes("9,999"));
  });
  await test("ทิศทางผิด/ปีสูงสุดผิด → ตัดด้วยกฎตายตัว แม้ fact-check ของ AI ปล่อยผ่าน", async () => {
    scenario = { section: (h) => ({ paragraphs: [...goodSection(h).paragraphs, "ปี 2565 สูงสุดที่ 5,249 ราย แล้วลดลงอีกครั้งในปี 2568"] }), factcheck: { problems: [] } };
    const r = await run();
    assert.ok(!JSON.stringify(r.article).includes("ปี 2565 สูงสุด"));
    assert.ok(r.check?.dropped.every((d) => d.includes("[กฎ:")));
  });
  await test("fact-check ของ AI ชี้ข้อความผิดบริบท → ข้อความนั้นถูกตัด", async () => {
    scenario = { factcheck: { problems: [{ id: 0, reason: "ผิดบริบท" }, { id: 999, reason: "id เกินช่วง ต้องไม่พัง" }, { id: "x" }] } };
    const r = await run();
    assert.equal(r.check?.dropped.length, 1);
    assert.ok(r.check?.dropped[0].includes("ตรวจซ้ำ: ผิดบริบท"));
  });
  await test("ผิดทุกย่อหน้า → ไม่บันทึก (โยน error)", async () => {
    scenario = { section: () => ({ paragraphs: ["รายได้ 77,777 ล้านบาท ซึ่งเป็นตัวเลขที่แต่งขึ้น ".repeat(25)] }) };
    await assert.rejects(run(), /เหลือเนื้อหาไม่พอ/);
  });
  await test("หัวเรื่อง/คำอธิบายมีตัวเลขแต่งหรือคำตีความเกิน → ใช้ข้อความมาตรฐานแทน", async () => {
    scenario = { outline: { ...GOOD_OUTLINE, title: "ธุรกิจทดสอบโต 300% น่าเชื่อถือที่สุด", description: "ตลาดมีศักยภาพสูง" } };
    const r = await run();
    assert.equal(r.article?.title, "สถิติธุรกิจทดสอบ ทั่วประเทศ");
    assert.ok(!r.article?.description.includes("ศักยภาพ"));
  });
  await test("AI พยายามเปลี่ยน slug/หมวด/บอกว่านอกขอบเขต → ระบบบังคับค่าของตัวเอง", async () => {
    scenario = { outline: { ...GOOD_OUTLINE, in_scope: false, slug: "../../admin", category: "การพนัน" } };
    const r = await run();
    assert.equal(r.article?.slug, "business-stats-00000");
    assert.equal(r.article?.category, "สถิติธุรกิจ");
  });
  await test("AI ใส่ HTML/สคริปต์ → ถูกตัด < > ออก", async () => {
    scenario = { section: (h) => ({ paragraphs: goodSection(h).paragraphs.map((p) => `${p}<script>alert(1)</script>`) }) };
    const r = await run();
    assert.ok(!/[<>]/.test(JSON.stringify(r.article)));
  });
  await test("AI ตอบไม่ใช่ JSON → error ไม่บันทึก", async () => {
    scenario = { raw: "ขออภัย ฉันไม่สามารถ..." };
    await assert.rejects(run());
  });
  await test("OpenAI ตอบ 429 (เกินโควตา) → error พร้อมข้อความ", async () => {
    scenario = { status: 429 };
    await assert.rejects(run(), /OpenAI 429: Rate limit/);
  });
  await test("ความรู้ทั่วไป: หัวข้อนอกขอบเขต → ปฏิเสธ", async () => {
    scenario = { outline: { in_scope: false, reason: "การพนัน" } };
    await assert.rejects(ai.writeArticle(cfg, "เลขเด็ดหวย", []), ai.OutOfScopeError);
  });
  await test("โมเดล gpt-5 ขึ้นไปส่ง max_completion_tokens ไม่ส่ง temperature / รุ่นเก่ากลับกัน", async () => {
    scenario = {};
    requests.length = 0;
    await ai.writeDataArticle({ ...cfg, model: "gpt-5.4-mini" }, fakeFacts);
    assert.ok(requests.every((q) => q.max_completion_tokens && q.temperature === undefined && q.max_tokens === undefined));
    requests.length = 0;
    await run();
    assert.ok(requests.every((q) => q.max_tokens && q.temperature !== undefined && q.max_completion_tokens === undefined));
  });
  await test("fact-check ใช้ temperature 0 (ผลคงที่)", async () => {
    requests.length = 0;
    await run();
    const fc = requests.find((q) => JSON.stringify(q).includes("fact-checker"));
    assert.equal(fc?.temperature, 0);
  });
  await test("ทุกคำขอส่งข้อมูลจริงไปให้ AI (ไม่มีหัวข้อย่อยไหนเขียนโดยไม่เห็นข้อมูล)", async () => {
    requests.length = 0;
    await run();
    const sections = requests.filter((q) => JSON.stringify(q).includes("1 หัวข้อย่อย"));
    assert.ok(sections.length >= 3 && sections.every((q) => JSON.stringify(q).includes("21,507")));
  });
  server.close();
  delete process.env.OPENAI_BASE_URL;

  if (!QUICK) {
    console.log("\nC. ตรวจข้อเท็จจริงจากฐานข้อมูลจริง (คำนวณซ้ำด้วยโค้ดอีกชุด)");
    const segs = [
      ...(await dbQuery<Array<{ t: string }> & import("mysql2").RowDataPacket[]>(
        `SELECT tsic_code t FROM juristic WHERE register_date >= ? AND tsic_code IS NOT NULL GROUP BY tsic_code HAVING COUNT(*) >= ? ORDER BY RAND() LIMIT 3`,
        [facts.DATA_FROM, facts.MIN_NATIONAL],
      )).map((r) => ({ tsic: String(r.t), province: null as string | null })),
      ...(await dbQuery<import("mysql2").RowDataPacket[]>(
        `SELECT tsic_code t, province p FROM juristic WHERE register_date >= ? AND tsic_code IS NOT NULL AND province <> ''
         GROUP BY tsic_code, province HAVING COUNT(*) >= ? ORDER BY RAND() LIMIT 3`,
        [facts.DATA_FROM, facts.MIN_PROVINCE],
      )).map((r) => ({ tsic: String(r.t), province: String(r.p) })),
      { tsic: "41002", province: null },
    ];
    const [[asOfRow]] = await Promise.all([dbQuery<import("mysql2").RowDataPacket[]>(`SELECT DATE_FORMAT(MAX(register_date), '%Y-%m-%d') d FROM juristic`)]);
    const asOf = new Date(`${asOfRow.d}T00:00:00Z`);
    const monthsBack = (m: number) => {
      const d = new Date(asOf);
      d.setUTCMonth(d.getUTCMonth() - m);
      return d.toISOString().slice(0, 10);
    };
    for (const seg of segs) {
      const label = `${seg.tsic}${seg.province ? ` ${seg.province}` : " ทั่วประเทศ"}`;
      await test(`ข้อมูล ${label}: ตัวเลขทุกตัวตรงกับการนับซ้ำ + ข้อความเปรียบเทียบที่ระบบสร้างผ่านกฎ`, async () => {
        const f = await facts.gatherFacts(seg);
        assert.ok(f, "gatherFacts คืน null");
        // นับซ้ำ: ดึงแถวดิบมานับใน JS (คนละวิธีกับ SQL aggregate ใน gatherFacts)
        const rows = await dbQuery<import("mysql2").RowDataPacket[]>(
          `SELECT DATE_FORMAT(register_date, '%Y-%m-%d') r, dissolved_date IS NOT NULL d, register_capital c, juristic_type t,
                  ${seg.province ? "district" : "province"} g
           FROM juristic WHERE register_date >= ? AND tsic_code = ? ${seg.province ? "AND province = ?" : ""}`,
          [facts.DATA_FROM, seg.tsic, ...(seg.province ? [seg.province] : [])],
        );
        const n = rows.length;
        const dissolved = rows.filter((r) => Number(r.d) === 1).length;
        assert.equal(f.raw.n, n, "จำนวนทั้งหมด");
        assert.equal(f.raw.dissolved, dissolved, "เลิกกิจการ");
        assert.equal(f.raw.active, n - dissolved, "ยังไม่เลิกกิจการ");
        const caps = rows.map((r) => Number(r.c)).sort((a, b) => a - b);
        assert.equal(f.raw.med, caps[Math.floor(n / 2)], "ทุนค่ากลาง");
        assert.equal(f.raw.p25, caps[Math.floor(n / 4)], "ควอร์ไทล์ 1");
        assert.equal(f.raw.p75, caps[Math.floor((n * 3) / 4)], "ควอร์ไทล์ 3");
        const byYear = new Map<number, number>();
        for (const r of rows) byYear.set(Number(String(r.r).slice(0, 4)) + 543, (byYear.get(Number(String(r.r).slice(0, 4)) + 543) ?? 0) + 1);
        for (const y of f.trend.years) assert.equal(y.n, byYear.get(y.be), `ปี ${y.be}`);
        const l12 = monthsBack(12);
        const l24 = monthsBack(24);
        assert.equal(f.trend.last12, rows.filter((r) => r.r > l12).length, "12 เดือนล่าสุด");
        assert.equal(f.trend.prev12, rows.filter((r) => r.r > l24 && r.r <= l12).length, "12 เดือนก่อนหน้า");
        const geo = new Map<string, number>();
        for (const r of rows) if (r.g) geo.set(String(r.g), (geo.get(String(r.g)) ?? 0) + 1);
        const top = [...geo.values()].sort((a, b) => b - a).slice(0, 5);
        assert.deepEqual(f.raw.geo, top, "อันดับพื้นที่");
        assert.equal(f.raw.bracketsSum, n, "ช่วงทุนรวม");
        // ตัวเลขที่ส่งให้ AI ทุกบรรทัดต้องอยู่ใน allowed และข้อความเปรียบเทียบที่ระบบสร้างต้องผ่านกฎของตัวเอง
        for (const line of f.lines) {
          assert.ok(facts.numbersIn(line).every((x) => f.allowed.has(x)), `ตัวเลขไม่อยู่ใน allowed: ${line}`);
          assert.equal(claims.checkTrendClaims(line, f.trend), null, `บรรทัดข้อมูลไม่ผ่านกฎ: ${line}`);
        }
        assert.ok(f.lines.some((l) => l.includes("จดทะเบียนใหม่")) && f.source.includes("ไม่ใช่จำนวนกิจการทั้งหมด"), "ต้องบอกขอบเขตข้อมูล");
      });
    }
  }

  console.log("\nD. บันทึก/เผยแพร่");
  const slug = `zz-test-${Date.now().toString(36)}`;
  let id = 0;
  try {
    await test("ฉบับร่างไม่โผล่บนเว็บ / เผยแพร่แล้วโผล่ / ไม่ใช้แล้วหาย", async () => {
      const long = "ย่อหน้าทดสอบระบบ ".repeat(40);
      id = await ai.saveAiArticle(
        { title: "ทดสอบ", description: "ทดสอบ", category: "ทำธุรกิจ", slug, minutes: 3, sections: [{ heading: "h", paragraphs: [long] }] },
        { topic: "test", model: "test", tokens: 0, publish: false },
        new Set(),
      );
      assert.equal(await ai.getAiArticleBySlug(slug), null, "ฉบับร่างต้องไม่แสดง");
      await dbQuery(`UPDATE ai_article SET status = 'published', published_at = NOW() WHERE id = ?`, [id]);
      assert.ok(await ai.getAiArticleBySlug(slug), "เผยแพร่แล้วต้องแสดง");
      await dbQuery(`UPDATE ai_article SET status = 'rejected' WHERE id = ?`, [id]);
      assert.equal(await ai.getAiArticleBySlug(slug), null, "ไม่ใช้แล้วต้องไม่แสดง");
    });
    await test("slug ซ้ำ → ต่อท้าย -2 ไม่ทับบทความเดิม", async () => {
      const id2 = await ai.saveAiArticle(
        { title: "ทดสอบ2", description: "x", category: "ทำธุรกิจ", slug, minutes: 3, sections: [] },
        { topic: "test", model: "test", tokens: 0, publish: false },
        new Set([slug]),
      );
      const a = await ai.getAiArticle(id2);
      await dbQuery(`DELETE FROM ai_article WHERE id = ? AND model = 'test'`, [id2]);
      assert.equal(a?.slug, `${slug}-2`);
    });
  } finally {
    // ลบเฉพาะแถวที่ชุดทดสอบสร้าง
    await dbQuery(`DELETE FROM ai_article WHERE slug LIKE ? AND model = 'test'`, [`${slug}%`]);
  }

  console.log("\nE. แสดงผล");
  await test("ข้อความจาก AI ถูก escape (ไม่มี HTML ทำงาน) + ตาราง/ที่มาแสดงครบ", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const View = (await import("@/components/AiArticleView")).default;
    const html = renderToStaticMarkup(
      React.createElement(View, {
        body: {
          sections: [{ heading: "<b>h</b>", paragraphs: ['<img src=x onerror="alert(1)">'], bullets: ["<script>x</script>"] }],
          facts: [{ label: "จดทะเบียนใหม่", value: "21,507 ราย" }],
          source: "ที่มา: ทดสอบ",
          links: [{ href: "/tsic/41002", label: "รายชื่อ" }],
        },
      }),
    );
    assert.ok(!/<img|<script|<b>h/.test(html), "มี HTML จาก AI หลุด");
    assert.ok(html.includes("&lt;img") && html.includes("21,507 ราย") && html.includes("ที่มา: ทดสอบ") && html.includes('href="/tsic/41002"'));
  });

  await closePool();
  console.log(`\n${fails.length ? "✖" : "✓"} ผ่าน ${pass} / ${pass + fails.length}${fails.length ? `\n  ไม่ผ่าน:\n  - ${fails.join("\n  - ")}` : ""}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
