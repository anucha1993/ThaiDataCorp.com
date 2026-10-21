/**
 * บทความอัตโนมัติด้วย OpenAI (GPT) — ใช้ร่วมกันระหว่างสคริปต์ ai-articles และหน้า /admin/articles
 * ไม่ import "server-only" เพื่อให้สคริปต์ใช้ได้
 *
 * ปลอดภัยไว้ก่อน:
 *   - ให้ AI ส่งกลับเป็น JSON โครงสร้างตายตัว (หัวข้อ/ย่อหน้า/รายการ) — ไม่รับ HTML จาก AI จึงไม่มีโค้ดแปลกปลอมในหน้าเว็บ
 *   - ค่าเริ่มต้นบันทึกเป็น "ฉบับร่าง" ให้ผู้ดูแลอ่านทวนก่อนเผยแพร่ (AdSense/Google ไม่ชอบเนื้อหา AI จำนวนมากที่ไม่มีคนตรวจ)
 *   - ตรวจความยาว/โครงสร้างก่อนบันทึก บทความสั้นหรือเพี้ยนจะถูกทิ้ง
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import type { DataFacts } from "@/lib/ai-data-facts";
import { checkClaims } from "@/lib/ai-claims";
import { numbersIn } from "@/lib/ai-data-facts";
import { getSetting } from "@/lib/settings";

export const AI_CATEGORIES = ["ตรวจสอบคู่ค้า", "พื้นฐานนิติบุคคล", "ภาษีและเอกสาร", "ทำธุรกิจ", "สถิติธุรกิจ"] as const;
export type AiCategory = (typeof AI_CATEGORIES)[number];

export interface AiSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface AiArticleBody {
  sections: AiSection[];
  /** บทความสถิติ: ตารางข้อมูลจริงจากฐานข้อมูล (ไม่ผ่าน AI) + ที่มา + ลิงก์ */
  facts?: Array<{ label: string; value: string }>;
  source?: string;
  links?: Array<{ href: string; label: string }>;
  /** ผลตรวจตัวเลขอัตโนมัติ: ตัวเลขที่ตรงกับข้อมูล / ย่อหน้าที่ถูกตัดเพราะมีตัวเลขไม่ตรง */
  check?: { verified: number; dropped: string[] };
}

/** general = ความรู้ทั่วไป · data = เขียนจากตัวเลขในฐานข้อมูลของเรา (แม่นกว่า) · mixed = สลับกัน */
export type AiMode = "data" | "mixed" | "general";

export interface AiArticle {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: AiCategory;
  minutes: number;
  body: AiArticleBody;
  topic: string | null;
  kind: "general" | "data";
  dataKey: string | null;
  status: "draft" | "published" | "rejected";
  model: string | null;
  tokens: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface AiConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
  autoPublish: boolean;
  mode: AiMode;
}

export const DEFAULT_AI_MODEL = "gpt-5.4-mini";

/** ขอบเขตเนื้อหาของเว็บ — ใช้ทั้งตอนเสนอหัวข้อและตอนเขียน (หัวข้อนอกขอบเขตจะถูกปฏิเสธ) */
export const SITE_SCOPE = `ขอบเขตเนื้อหาของเว็บ (เขียนได้เฉพาะเรื่องเหล่านี้):
1. การตรวจสอบบริษัท/คู่ค้า/ซัพพลายเออร์ และการป้องกันการโกงทางธุรกิจ
2. ความรู้นิติบุคคลไทย: ประเภทกิจการ การจดทะเบียน สถานะ ทุน ผู้ถือหุ้น กรรมการ วัตถุประสงค์ ที่ตั้ง งบการเงิน การเลิก/ชำระบัญชี
3. ภาษีและเอกสารธุรกิจ: VAT ใบกำกับภาษี ภาษีหัก ณ ที่จ่าย ภาษีเงินได้นิติบุคคล หนังสือรับรอง
4. งานจัดซื้อจัดจ้างภาครัฐ มาตรฐานสินค้า (มอก.) ประเภทธุรกิจ (TSIC)
5. การทำธุรกิจ B2B ในไทย: หาลูกค้า/คู่ค้า การทำสัญญา การเปิดบริษัท การบริหารเอกสาร PDPA สำหรับข้อมูลธุรกิจ
นอกขอบเขต (ห้ามเขียน): การเงินส่วนบุคคล การลงทุน/หุ้น/คริปโต การพนัน สุขภาพ ความงาม บันเทิง การเมือง ศาสนา ข่าว ซุบซิบ การรีวิวสินค้า การโฆษณาบริษัทใดบริษัทหนึ่ง`;

export async function getAiConfig(): Promise<AiConfig> {
  const [enabled, key, model, auto, mode] = await Promise.all([
    getSetting("ai_enabled"),
    getSetting("openai_api_key"),
    getSetting("ai_model"),
    getSetting("ai_auto_publish"),
    getSetting("ai_mode"),
  ]);
  return {
    enabled: enabled === "1",
    // ค่าใน env มาก่อน (ปลอดภัยกว่า) — ถ้าไม่มีใช้ค่าที่บันทึกจากหน้าแอดมิน
    apiKey: (process.env.OPENAI_API_KEY ?? "").trim() || (key ?? "").trim(),
    model: (model ?? "").trim() || DEFAULT_AI_MODEL,
    autoPublish: auto === "1",
    mode: mode === "general" || mode === "mixed" ? mode : "data",
  };
}

/* ------------------------------------------------------------------ OpenAI */

const RULES = `คุณคือนักเขียนบทความความรู้ด้านธุรกิจของเว็บไซต์ ThaiDataCorp (คลังข้อมูลนิติบุคคลและธุรกิจไทยจากข้อมูลเปิดภาครัฐ)
ผู้อ่านคือเจ้าของกิจการ ฝ่ายจัดซื้อ ฝ่ายบัญชี และคนทำงานในไทย

กติกาสำคัญ:
- เขียนภาษาไทยที่เป็นธรรมชาติ อ่านง่าย ใช้ได้จริง มีตัวอย่างสถานการณ์และขั้นตอนที่นำไปทำได้
- ความถูกต้องสำคัญที่สุด: ห้ามแต่งตัวเลข สถิติ อัตราภาษี ค่าธรรมเนียม เลขมาตรากฎหมาย หรือชื่อหน่วยงานที่ไม่แน่ใจ ถ้าไม่แน่ใจให้เขียนหลักทั่วไปและแนะนำให้ตรวจสอบกับหน่วยงานที่เกี่ยวข้อง
- ห้ามกล่าวถึงบริษัทเอกชนรายใดรายหนึ่ง ห้ามให้คำแนะนำทางกฎหมาย/ภาษีแบบเจาะจงรายกรณี
- ห้ามคัดลอกเนื้อหาจากแหล่งอื่น เขียนอธิบายด้วยคำของตัวเอง
- เมื่อเหมาะสม แนะนำให้ผู้อ่านใช้เครื่องมือของ ThaiDataCorp ได้ เช่น ค้นหาบริษัทด้วยเลขทะเบียน 13 หลัก ดูสถานะ การจด VAT งานภาครัฐ ประเภทธุรกิจ (TSIC) และความเคลื่อนไหวนิติบุคคล
- ห้ามระบุตัวเลขที่เป็นข้อกำหนดทางราชการ เช่น อัตราภาษี เปอร์เซ็นต์ ค่าปรับ ค่าธรรมเนียม วันกำหนดยื่น จำนวนวัน หรือเลขแบบฟอร์ม ให้เขียนว่า "ตามอัตรา/กำหนดเวลาที่หน่วยงานประกาศ" และแนะนำให้ตรวจสอบที่เว็บไซต์หน่วยงานแทน
- ไม่ใส่ Markdown, HTML, emoji หรือลิงก์ในข้อความ และไม่ใส่จุด (.) ท้ายประโยคภาษาไทย`;

/** ขั้นที่ 1: ตรวจขอบเขต + วางโครงเรื่อง */
const OUTLINE_PROMPT = `${RULES}

${SITE_SCOPE}

ถ้าหัวข้อที่ได้รับอยู่นอกขอบเขต ห้ามเขียน ให้ตอบ {"in_scope": false, "reason": "<อธิบายว่าทำไมหัวข้อนี้ไม่เกี่ยวกับเว็บ>"} เท่านั้น

ถ้าอยู่ในขอบเขต ให้วางโครงบทความ ตอบเป็น JSON เท่านั้น:
{"in_scope": true,
 "title": "หัวเรื่อง 40–90 ตัวอักษร",
 "description": "สรุป 1–2 ประโยค ไม่เกิน 160 ตัวอักษร",
 "slug": "english-words-with-dashes ไม่เกิน 60 ตัวอักษร",
 "category": "หนึ่งใน: ${AI_CATEGORIES.join(" | ")}",
 "sections": [{"heading": "หัวข้อย่อย", "points": ["ประเด็นที่จะอธิบายในหัวข้อนี้", "..."]}]}
มี 5–7 sections แต่ละ section มี 3–5 points ไม่ซ้ำกัน เรียงจากพื้นฐานไปสู่การนำไปใช้ section สุดท้ายเป็นสรุป/เช็กลิสต์`;

/** ขั้นที่ 2: เขียนเนื้อหาทีละหัวข้อย่อย (เขียนทีเดียวทั้งบทความ โมเดลมักเขียนสั้นเกินไป) */
const SECTION_PROMPT = `${RULES}

คุณกำลังเขียนเนื้อหา 1 หัวข้อย่อยของบทความ ตอบเป็น JSON เท่านั้น:
{"paragraphs": ["ย่อหน้า", "..."], "bullets": ["(ไม่บังคับ) รายการสั้นๆ ถ้าเนื้อหาเป็นขั้นตอนหรือเช็กลิสต์"]}
เขียน 3–4 ย่อหน้า แต่ละย่อหน้า 3–5 ประโยค ยาวประมาณ 250–450 ตัวอักษร อธิบายครบทุกประเด็นที่ได้รับ
อย่าเขียนซ้ำเนื้อหาของหัวข้ออื่นในบทความ อย่าขึ้นต้นด้วยการทวนชื่อหัวข้อ`;

/* บทความสถิติธุรกิจ — AI แค่เรียบเรียงข้อมูลจริงจากฐานข้อมูล แล้วระบบตรวจตัวเลขทุกตัวซ้ำ */
/** ข้อจำกัดของข้อมูล — ใช้ทั้งตอนเขียนและตอนตรวจ */
const DATA_CAVEATS = `ข้อจำกัดในการตีความ (ห้ามสรุปเกินนี้):
- จำนวนจดทะเบียนใหม่ไม่ใช่จำนวนธุรกิจทั้งหมดหรือขนาดตลาด
- สัดส่วนที่ยังไม่เลิกกิจการสูงเป็นเรื่องปกติของกิจการที่เพิ่งจดทะเบียนไม่นาน ห้ามสรุปว่าธุรกิจมั่นคง อยู่รอดดี หรือประสบความสำเร็จ
- การจด VAT ขึ้นกับรายได้และการตัดสินใจของแต่ละกิจการ ห้ามสรุปเรื่องการปฏิบัติตามกฎหมาย ความน่าเชื่อถือ หรือขนาดรายได้
- ทุนจดทะเบียนไม่ใช่เงินที่ลงทุนจริงหรือรายได้ ห้ามสรุปว่าเป็นขนาดกิจการหรือความสามารถในการหาเงินทุน
- ใบอนุญาต มอก. และงานภาครัฐเป็นข้อเท็จจริงเชิงจำนวน ห้ามสรุปเรื่องคุณภาพหรือความสามารถ
- ห้ามระบุสาเหตุของแนวโน้ม (เช่น เศรษฐกิจ โควิด นโยบาย โครงสร้างพื้นฐาน การท่องเที่ยว)
- ห้ามสรุปว่าตัวเลขสะท้อนความต้องการของตลาด โอกาสทางธุรกิจ ความน่าเชื่อถือ คุณภาพ หรือการแข่งขัน แม้จะใช้คำว่า "อาจ" ก็ห้าม
- การตีความที่อนุญาต: อธิบายว่าตัวเลขหมายถึงอะไรตามตัวอักษร เปรียบเทียบตัวเลขที่ให้ไว้ (มากกว่า/น้อยกว่า เพิ่ม/ลด) และบอกวิธีนำข้อมูลไปใช้ เช่น ใช้หาคู่ค้า ตรวจสอบบริษัท ดูคู่แข่งในพื้นที่ หรือวางแผนทุนจดทะเบียนโดยปรึกษาผู้เชี่ยวชาญ`;

const DATA_RULES = `คุณคือนักวิเคราะห์ข้อมูลธุรกิจของเว็บไซต์ ThaiDataCorp (คลังข้อมูลนิติบุคคลและธุรกิจไทยจากข้อมูลเปิดภาครัฐ)
ผู้อ่านคือคนที่กำลังจะเปิดธุรกิจ ผู้ประกอบการ ฝ่ายจัดซื้อ และฝ่ายขาย B2B

กติกาสำคัญ (ความถูกต้องสำคัญที่สุด):
- ตัวเลขทุกตัวต้องคัดลอกจาก "ข้อมูลจริง" ที่ให้ไว้เท่านั้น เขียนให้ตรงตัวอักษร ห้ามคำนวณใหม่ ห้ามปัดเศษ ห้ามแปลงหน่วย ห้ามเปลี่ยน พ.ศ. เป็น ค.ศ. ถ้าข้อมูลไม่มี ห้ามใส่ตัวเลข
- ระบุให้ชัดว่าเป็นตัวเลขของ "นิติบุคคลที่จดทะเบียนใหม่" ในช่วงเวลาที่ระบุ ไม่ใช่จำนวนธุรกิจทั้งหมดในประเทศ
- ห้ามอ้างสาเหตุของแนวโน้มเป็นข้อเท็จจริง ถ้าจะตั้งข้อสังเกตให้ใช้คำว่า "อาจ" และบอกว่าเป็นข้อสังเกต
- ห้ามกล่าวถึงชื่อบริษัทใด ไม่ใช่คำแนะนำการลงทุน
- เขียนภาษาไทยที่เป็นธรรมชาติ อ่านง่าย ตีความตัวเลขให้ผู้อ่านเข้าใจว่าหมายถึงอะไรและนำไปใช้อย่างไร
- ไม่ใส่ Markdown, HTML, emoji หรือลิงก์ และไม่ใส่จุด (.) ท้ายประโยคภาษาไทย
- หน้าเว็บแสดงหมายเหตุขอบเขตข้อมูลให้แล้ว ไม่ต้องเขียนคำเตือนหรือข้อจำกัดของข้อมูลซ้ำ (บอกขอบเขตได้ครั้งเดียวในหัวข้อภาพรวม) ข้อจำกัดด้านล่างมีไว้ห้ามสรุปเกิน ไม่ใช่ให้เขียนลงบทความ
${DATA_CAVEATS}`;

const DATA_OUTLINE_PROMPT = `${DATA_RULES}

วางโครงบทความจากข้อมูลจริงที่ได้รับ ตอบเป็น JSON เท่านั้น:
{"title": "หัวเรื่อง 40–100 ตัวอักษร ต้องมีชื่อกลุ่มธุรกิจ/พื้นที่",
 "description": "สรุป 1–2 ประโยค ไม่เกิน 160 ตัวอักษร",
 "sections": [{"heading": "หัวข้อย่อย", "points": ["ประเด็น/ข้อมูลที่จะใช้ในหัวข้อนี้", "..."]}]}
มี 5–6 sections ครอบคลุม ภาพรวม, แนวโน้มการจดทะเบียน, ขนาดทุนและรูปแบบนิติบุคคล, พื้นที่, การจด VAT งานภาครัฐ และ มอก., วิธีใช้ข้อมูลนี้สำหรับผู้ที่จะเปิดธุรกิจหรือหาคู่ค้าในกลุ่มนี้
ตั้งชื่อหัวข้อย่อยเป็นประโยคที่อ่านลื่น ห้ามใช้เครื่องหมาย / ห้ามใช้ข้อมูลซ้ำหลาย section`;

const DATA_SECTION_PROMPT = `${DATA_RULES}

คุณกำลังเขียนเนื้อหา 1 หัวข้อย่อยของบทความ ตอบเป็น JSON เท่านั้น:
{"paragraphs": ["ย่อหน้า", "..."], "bullets": ["(ไม่บังคับ) รายการสั้นๆ"]}
เขียน 2–4 ย่อหน้า แต่ละย่อหน้า 3–5 ประโยค ยาวประมาณ 250–450 ตัวอักษร ใช้เฉพาะข้อมูลที่เกี่ยวกับหัวข้อนี้
อย่าเขียนซ้ำเนื้อหาของหัวข้ออื่น อย่าขึ้นต้นด้วยการทวนชื่อหัวข้อ
ถ้าเป็นหัวข้อวิธีใช้ข้อมูล ให้เน้นขั้นตอนปฏิบัติ (เช่น กรองรายชื่อตามประเภทธุรกิจและจังหวัด ตรวจสถานะ ดู VAT) ไม่ต้องทวนตัวเลขจากหัวข้ออื่น`;

async function chat(
  cfg: AiConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
  maxTokens: number,
  temperature = 0.6,
) {
  // OPENAI_BASE_URL ไว้ชี้ไป endpoint ที่เข้ากันได้กับ OpenAI (หรือเซิร์ฟเวอร์จำลองตอนทดสอบ)
  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  // โมเดลแบบคิดก่อนตอบ (gpt-5+, o-series) ไม่รับ temperature/max_tokens และใช้ token ส่วนหนึ่งไปกับการคิด
  const reasoning = /^(gpt-[5-9]|o\d)/.test(cfg.model);
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      response_format: { type: "json_object" },
      ...(reasoning
        ? { max_completion_tokens: maxTokens * 4, reasoning_effort: "low" }
        : { temperature, max_tokens: maxTokens }),
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${body.error?.message ?? "error"}`);
  const text = body.choices?.[0]?.message?.content ?? "";
  return { json: JSON.parse(text) as Record<string, unknown>, tokens: Number(body.usage?.total_tokens ?? 0) };
}

const str = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** ข้อความที่มีตัวเลข/เปอร์เซ็นต์ — จุดที่ AI มักแต่งข้อมูลผิด ต้องให้คนตรวจ */
export const RISKY_TEXT = /[0-9๐-๙]|%|ร้อยละ/;
export const countRiskyText = (b: AiArticleBody) =>
  b.sections.reduce((n, s) => n + [...s.paragraphs, ...(s.bullets ?? [])].filter((t) => RISKY_TEXT.test(t)).length, 0);

export class OutOfScopeError extends Error {}

/** ตรวจ + ทำความสะอาดผลจาก AI — คืน null ถ้าไม่ผ่านเกณฑ์ · โยน OutOfScopeError ถ้า AI บอกว่านอกขอบเขต */
export function sanitizeArticle(j: Record<string, unknown>) {
  if (j.in_scope !== true) throw new OutOfScopeError(`หัวข้ออยู่นอกขอบเขตเนื้อหาเว็บ${j.reason ? `: ${str(j.reason, 200)}` : ""}`);
  const title = str(j.title, 160);
  const description = str(j.description, 300);
  const category = (AI_CATEGORIES as readonly string[]).includes(String(j.category)) ? (j.category as AiCategory) : "ทำธุรกิจ";
  const rawSections = Array.isArray(j.sections) ? j.sections : [];
  const sections: AiSection[] = rawSections
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const paragraphs = (Array.isArray(o.paragraphs) ? o.paragraphs : []).map((p) => str(p, 2000)).filter((p) => p.length > 20);
      const bullets = (Array.isArray(o.bullets) ? o.bullets : []).map((b) => str(b, 400)).filter(Boolean).slice(0, 12);
      return { heading: str(o.heading, 160), paragraphs, ...(bullets.length && { bullets }) };
    })
    .filter((s) => s.heading && s.paragraphs.length)
    .slice(0, 9);
  const chars = sections.reduce((n, s) => n + s.paragraphs.join("").length + (s.bullets ?? []).join("").length, 0);
  if (!title || !description || sections.length < 3 || chars < 1800) return null;
  const slug =
    String(j.slug ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `article-${Date.now().toString(36)}`;
  return { title, description, category, slug, sections, minutes: Math.max(3, Math.round(chars / 900)) };
}

/** ให้ AI เสนอหัวข้อใหม่ที่ไม่ซ้ำกับบทความที่มีอยู่ */
export async function proposeTopic(cfg: AiConfig, existingTitles: string[]): Promise<{ topic: string; tokens: number }> {
  const { json, tokens } = await chat(
    cfg,
    [
      {
        role: "system",
        content:
          `คุณช่วยวางแผนบทความความรู้สำหรับเว็บ ThaiDataCorp (คลังข้อมูลนิติบุคคลและธุรกิจไทย)
${SITE_SCOPE}
ตอบเป็น JSON {"topic": "..."} เท่านั้น`,
      },
      {
        role: "user",
        content: `เสนอหัวข้อบทความใหม่ 1 หัวข้อ ที่คนทำธุรกิจในไทยค้นหาจริงและมีประโยชน์ ไม่ซ้ำหรือใกล้เคียงกับบทความที่มีแล้วต่อไปนี้:\n- ${existingTitles.slice(0, 300).join("\n- ")}`,
      },
    ],
    200,
  );
  const topic = str(json.topic, 200);
  if (!topic) throw new Error("AI ไม่ได้เสนอหัวข้อ");
  return { topic, tokens };
}

/** เขียนบทความ 2 ขั้น: วางโครง (ตรวจขอบเขตด้วย) → เขียนทีละหัวข้อย่อย */
export async function writeArticle(cfg: AiConfig, topic: string, existingTitles: string[]) {
  return compose(cfg, {
    outlineSystem: OUTLINE_PROMPT,
    sectionSystem: SECTION_PROMPT,
    outlineUser: `หัวข้อ: ${topic}\n\nบทความที่มีอยู่แล้ว (อย่าซ้ำ):\n- ${existingTitles.slice(0, 200).join("\n- ")}`,
    context: "",
  });
}

/** ตัดย่อหน้า/รายการที่มีตัวเลขไม่ตรงกับข้อมูลจริง — คืนจำนวนตัวเลขที่ตรวจผ่าน + ข้อความที่ถูกตัด */
export function verifyNumbers(sections: AiSection[], allowed: Set<string>) {
  let verified = 0;
  const dropped: string[] = [];
  const ok = (t: string) => {
    const nums = numbersIn(t);
    if (nums.every((x) => allowed.has(x))) {
      verified += nums.length;
      return true;
    }
    dropped.push(`${t.slice(0, 160)} [ไม่ตรง: ${nums.filter((x) => !allowed.has(x)).join(", ")}]`);
    return false;
  };
  const out = sections
    .filter((s) => numbersIn(s.heading).every((x) => allowed.has(x)))
    .map((s) => {
      const bullets = (s.bullets ?? []).filter(ok);
      return { heading: s.heading, paragraphs: s.paragraphs.filter(ok), ...(bullets.length && { bullets }) };
    })
    .filter((s) => s.paragraphs.length);
  return { sections: out, verified, dropped };
}

/** ตัดย่อหน้า/รายการที่ไม่ผ่าน check (คืนเหตุผล = ไม่ผ่าน) · หัวข้อที่ไม่ผ่าน = ตัดทั้ง section */
export function dropItems(sections: AiSection[], check: (t: string) => string | null, tag: string) {
  const dropped: string[] = [];
  const keep = (t: string) => {
    const reason = check(t);
    if (!reason) return true;
    dropped.push(`${t.slice(0, 160)} [${tag}: ${reason}]`);
    return false;
  };
  const out = sections
    .filter((s) => keep(s.heading))
    .map((s) => {
      const paragraphs = s.paragraphs.filter(keep);
      const bullets = (s.bullets ?? []).filter(keep);
      return { heading: s.heading, paragraphs, ...(bullets.length && { bullets }) };
    })
    .filter((s) => s.paragraphs.length);
  return { sections: out, dropped };
}

/** บทความสถิติธุรกิจจากข้อมูลจริง — ตัวเลขทุกตัวถูกตรวจกับข้อมูลก่อนบันทึก */
export async function writeDataArticle(cfg: AiConfig, facts: DataFacts) {
  const context = `ข้อมูลจริง (${facts.subject}):\n- ${facts.lines.join("\n- ")}`;
  const r = await compose(cfg, {
    outlineSystem: DATA_OUTLINE_PROMPT,
    sectionSystem: DATA_SECTION_PROMPT,
    outlineUser: `เขียนบทความสถิติเรื่อง: ${facts.subject}\n\n${context}`,
    context,
    force: { in_scope: true, category: "สถิติธุรกิจ", slug: facts.slug },
  });
  if (!r.article) return { ...r, check: null };
  // ชั้นที่ 1: ตัวเลขทุกตัวต้องมีอยู่ในข้อมูลจริง
  const num = verifyNumbers(r.article.sections, facts.allowed);
  // ชั้นที่ 2: กฎตายตัว (ไม่ใช้ AI) — ทิศทาง/ปีสูงสุด/ปีไม่ครบ/12 เดือน/คำตีความเกิน/ชื่อบริษัท
  const rule = dropItems(num.sections, (t) => checkClaims(t, facts.trend), "กฎ");
  // ชั้นที่ 3: ให้ AI อีกรอบเทียบทุกย่อหน้ากับข้อมูล — ตัวเลขผิดบริบท / ตีความเกินข้อมูล → ตัดทิ้ง
  const fc = await factCheck(cfg, context, rule.sections);
  const v = { sections: fc.sections, verified: num.verified, dropped: [...num.dropped, ...rule.dropped, ...fc.dropped] };
  r.tokens += fc.tokens;
  const chars = v.sections.reduce((n, s) => n + s.paragraphs.join("").length + (s.bullets ?? []).join("").length, 0);
  if (v.sections.length < 3 || chars < 1800) {
    throw new Error(`ตัดย่อหน้าที่ตัวเลขไม่ตรงข้อมูลแล้วเหลือเนื้อหาไม่พอ (ตัด ${v.dropped.length} จุด)`);
  }
  // หัวเรื่อง/คำอธิบายแสดงบนผลค้นหา — ต้องผ่านกฎเดียวกัน ไม่ผ่านใช้ข้อความมาตรฐานแทน
  const passes = (t: string) => numbersIn(t).every((x) => facts.allowed.has(x)) && !checkClaims(t, facts.trend);
  const title = passes(r.article.title) ? r.article.title : `สถิติ${facts.subject}`;
  const description = passes(r.article.description)
    ? r.article.description
    : `สถิตินิติบุคคลจดทะเบียนใหม่${facts.subject} จำนวน ทุนจดทะเบียน พื้นที่ และการจด VAT จากข้อมูลเปิดภาครัฐ`;
  return {
    tokens: r.tokens,
    article: { ...r.article, title, description, sections: v.sections, minutes: Math.max(3, Math.round(chars / 900)) },
    check: { verified: v.verified, dropped: v.dropped },
  };
}

const FACTCHECK_PROMPT = `คุณคือผู้ตรวจข้อเท็จจริง (fact-checker) ที่เข้มงวด ตรวจข้อความแต่ละข้อเทียบกับ "ข้อมูลจริง" ที่ให้ไว้
ให้รายงานข้อความที่มีปัญหาอย่างใดอย่างหนึ่ง:
1. ตัวเลขถูกใช้ผิดบริบท เช่น เอาจำนวนของกลุ่มหนึ่งไปพูดว่าเป็นอีกกลุ่ม ผิดปี ผิดพื้นที่ หรือผิดหน่วย
2. อ้างข้อเท็จจริงที่ไม่มีในข้อมูลจริง (เช่น เปรียบเทียบที่ข้อมูลไม่ได้บอก) หรือสรุปทิศทางผิด (เพิ่ม/ลด มาก/น้อย)
3. ตีความเกินข้อจำกัดของข้อมูลต่อไปนี้
${DATA_CAVEATS}
การใช้คำว่า "อาจ" ไม่ทำให้ข้อความที่ตีความเกินข้อจำกัดผ่าน — ให้รายงานเสมอ
ข้อความที่อธิบายตัวเลขตามตัวอักษร หรือแนะนำวิธีนำข้อมูลไปใช้ ถือว่าผ่าน
ตรวจทุกข้ออย่างละเอียด ถ้าไม่แน่ใจให้รายงาน
ตอบเป็น JSON เท่านั้น: {"problems": [{"id": หมายเลขข้อความ, "reason": "เหตุผลสั้นๆ"}]} ถ้าไม่มีปัญหาตอบ {"problems": []}`;

/** ตรวจข้อเท็จจริงรอบสอง — คืนเนื้อหาที่ตัดข้อความมีปัญหาออกแล้ว */
async function factCheck(cfg: AiConfig, context: string, sections: AiSection[]) {
  const items: string[] = [];
  for (const s of sections) items.push(...s.paragraphs, ...(s.bullets ?? []));
  const { json, tokens } = await chat(
    cfg,
    [
      { role: "system", content: FACTCHECK_PROMPT },
      { role: "user", content: `${context}\n\nข้อความที่ต้องตรวจ:\n${items.map((t, i) => `[${i}] ${t}`).join("\n")}` },
    ],
    1500,
    0,
  );
  const bad = new Map<number, string>();
  for (const p of Array.isArray(json.problems) ? json.problems : []) {
    const o = (p ?? {}) as Record<string, unknown>;
    const id = Number(o.id);
    if (Number.isInteger(id) && id >= 0 && id < items.length) bad.set(id, str(o.reason, 200));
  }
  let k = 0;
  const dropped: string[] = [];
  const keep = (t: string) => {
    const reason = bad.get(k++);
    if (reason === undefined) return true;
    dropped.push(`${t.slice(0, 160)} [ตรวจซ้ำ: ${reason}]`);
    return false;
  };
  const out = sections
    .map((s) => {
      const paragraphs = s.paragraphs.filter(keep);
      const bullets = (s.bullets ?? []).filter(keep);
      return { heading: s.heading, paragraphs, ...(bullets.length && { bullets }) };
    })
    .filter((s) => s.paragraphs.length);
  return { sections: out, dropped, tokens };
}

async function compose(
  cfg: AiConfig,
  p: { outlineSystem: string; sectionSystem: string; outlineUser: string; context: string; force?: Record<string, unknown> },
) {
  const outline = await chat(
    cfg,
    [
      { role: "system", content: p.outlineSystem },
      { role: "user", content: p.outlineUser },
    ],
    1500,
  );
  let tokens = outline.tokens;
  const o = { ...outline.json, ...p.force };
  if (o.in_scope !== true) return { article: sanitizeArticle(o), tokens }; // โยน OutOfScopeError
  const plan = (Array.isArray(o.sections) ? o.sections : [])
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .map((x) => ({ heading: str(x.heading, 160), points: (Array.isArray(x.points) ? x.points : []).map((p) => str(p, 300)).filter(Boolean) }))
    .filter((x) => x.heading)
    .slice(0, 8);
  const headings = plan.map((x) => x.heading);
  // ทีละ 3 หัวข้อพร้อมกัน — เร็วขึ้นแต่ไม่ยิงถี่จนติด rate limit
  const written: Array<Record<string, unknown>> = [];
  for (let i = 0; i < plan.length; i += 3) {
    const batch = await Promise.all(
      plan.slice(i, i + 3).map((sec) =>
        chat(
          cfg,
          [
            { role: "system", content: p.sectionSystem },
            {
              role: "user",
              content: `${p.context ? `${p.context}\n\n` : ""}บทความ: ${str(o.title, 160)}\nโครงทั้งบทความ: ${headings.join(" / ")}\n\nหัวข้อย่อยที่ต้องเขียน: ${sec.heading}\nประเด็น:\n- ${sec.points.join("\n- ")}`,
            },
          ],
          1800,
        ),
      ),
    );
    for (const [k, r] of batch.entries()) {
      tokens += r.tokens;
      written.push({ heading: plan[i + k].heading, paragraphs: r.json.paragraphs, bullets: r.json.bullets });
    }
  }
  return { article: sanitizeArticle({ ...o, sections: written }), tokens };
}

/* ------------------------------------------------------------------ DB */

/** "YYYY-MM-DD HH:mm:ss" (mysql2 อาจคืน Date หรือ string) */
const dt = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : String(v));

function toArticle(r: RowDataPacket): AiArticle {
  let body: AiArticleBody = { sections: [] };
  try {
    body = typeof r.body === "string" ? (JSON.parse(r.body) as AiArticleBody) : (r.body as AiArticleBody);
  } catch {
    /* body เสีย → ว่าง */
  }
  return {
    id: Number(r.id),
    slug: r.slug,
    title: r.title,
    description: r.description,
    category: r.category,
    minutes: Number(r.minutes ?? 5),
    body,
    topic: r.topic ?? null,
    kind: r.kind === "data" ? "data" : "general",
    dataKey: r.data_key ?? null,
    status: r.status,
    model: r.model ?? null,
    tokens: Number(r.tokens ?? 0),
    createdAt: dt(r.created_at),
    publishedAt: r.published_at ? dt(r.published_at) : null,
  };
}

export async function saveAiArticle(
  a: NonNullable<ReturnType<typeof sanitizeArticle>>,
  meta: {
    topic: string;
    model: string;
    tokens: number;
    publish: boolean;
    kind?: "general" | "data";
    dataKey?: string;
    /** ส่วนที่ไม่ได้มาจาก AI: ตารางข้อมูล ที่มา ลิงก์ ผลตรวจตัวเลข */
    extra?: Omit<AiArticleBody, "sections">;
  },
  reservedSlugs: Set<string>,
): Promise<number> {
  let slug = a.slug;
  for (let i = 2; reservedSlugs.has(slug); i++) slug = `${a.slug}-${i}`;
  const body: AiArticleBody = { sections: a.sections, ...meta.extra };
  const res = await dbQuery<ResultSetHeader>(
    `INSERT INTO ai_article (slug, title, description, category, minutes, body, topic, status, model, tokens, kind, data_key, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${meta.publish ? "NOW()" : "NULL"})`,
    [
      slug,
      a.title,
      a.description,
      a.category,
      a.minutes,
      JSON.stringify(body),
      meta.topic,
      meta.publish ? "published" : "draft",
      meta.model,
      meta.tokens,
      meta.kind ?? "general",
      meta.dataKey ?? null,
    ],
  );
  return res.insertId;
}

export async function listAiArticles(status?: AiArticle["status"], limit = 200): Promise<AiArticle[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT * FROM ai_article ${status ? "WHERE status = ?" : ""} ORDER BY COALESCE(published_at, created_at) DESC LIMIT ${limit}`,
    status ? [status] : [],
  );
  return rows.map(toArticle);
}

export async function getAiArticleBySlug(slug: string, publishedOnly = true): Promise<AiArticle | null> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT * FROM ai_article WHERE slug = ? ${publishedOnly ? "AND status = 'published'" : ""} LIMIT 1`,
    [slug],
  );
  return rows[0] ? toArticle(rows[0]) : null;
}

export async function getAiArticle(id: number): Promise<AiArticle | null> {
  const rows = await dbQuery<RowDataPacket[]>(`SELECT * FROM ai_article WHERE id = ?`, [id]);
  return rows[0] ? toArticle(rows[0]) : null;
}
