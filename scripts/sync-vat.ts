/**
 * Sync ทะเบียนผู้ประกอบการจดทะเบียนภาษีมูลค่าเพิ่ม (กรมสรรพากร) → ตาราง juristic_vat
 *
 *   npm run sync:vat
 *
 * แหล่งข้อมูล: data.go.th "รายชื่อผู้ประกอบการจดทะเบียนภาษีมูลค่าเพิ่ม" (vat_taxpayeraddress_10_01, Open Data Common)
 *   - ไฟล์ CSV 2 ไฟล์: กรุงเทพฯ (TIS-620) และต่างจังหวัด (UTF-8) รวม ~320 MB — อ่านแบบ stream ไม่โหลดทั้งไฟล์
 *   - มีเฉพาะผู้ที่ยังประกอบกิจการอยู่ 1 แถว = 1 สาขา (เลขที่สาขา 0 = สำนักงานใหญ่)
 *   - เก็บเฉพาะนิติบุคคล (เลข 13 หลักขึ้นต้น 0 ที่ checksum ถูก) — บุคคลธรรมดาไม่เก็บ (PDPA)
 *
 * โหลดลงตารางชั่วคราวทั้งชุดแล้วสลับชื่อตาราง — ถ้าได้ข้อมูลน้อยผิดปกติ (ไฟล์ขาด) จะไม่สลับ
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SOURCES = [
  {
    label: "กรุงเทพมหานคร",
    url: "https://data.rd.go.th/dataset/558c27ab-874c-4bd2-9758-ecf2c026dfd6/resource/5168fafa-518f-41d9-90f1-82658d2773e0/download/vat_taxpayeraddress_01.csv",
  },
  { label: "ต่างจังหวัด", url: "https://data.rd.go.th/datafiles/vat/VAT_TaxpayerAddress_02.csv" },
];
const BATCH = 2_000;
/** ได้แถวน้อยกว่าสัดส่วนนี้ของรอบก่อน → ถือว่าไฟล์ผิดปกติ ไม่สลับตาราง */
const MIN_RATIO = 0.7;
/** ชื่อบุคคลธรรมดา/คณะบุคคล (เลข 099 บางรายเป็นคณะบุคคลที่ใช้ชื่อคน) — ไม่เก็บ */
const PERSON = /^(นาย|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|คณะบุคคล)|^(mr|mrs|miss|ms)\.?\s/i;

/** แยก 1 บรรทัด CSV (รองรับ "..." และ "" ภายใน) */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const clean = (s: string | undefined, max = 255) => {
  const v = (s ?? "").replace(/\s+/g, " ").trim();
  return v && v !== "-" ? v.slice(0, max) : null;
};

/** "2559-09-22" (พ.ศ.) → "2016-09-22" */
function beDate(s: string | undefined): string | null {
  const m = (s ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]) - 543;
  return y > 1900 && y < 2100 ? `${y}-${m[2]}-${m[3]}` : null;
}

type Addr = Record<"building" | "room" | "floor" | "village" | "no" | "moo" | "soi" | "yaek" | "road" | "sub" | "dist" | "prov" | "post", string | null>;

function buildAddress(c: Addr): string {
  const bkk = c.prov === "กรุงเทพมหานคร";
  const parts = [
    c.building && `อาคาร${c.building.replace(/^อาคาร\s*/, "")}`,
    c.room && `ห้อง ${c.room}`,
    c.floor && `ชั้น ${c.floor}`,
    c.village && `หมู่บ้าน${c.village.replace(/^หมู่บ้าน\s*/, "")}`,
    c.no && `เลขที่ ${c.no}`,
    c.moo && `หมู่ ${c.moo}`,
    c.soi && `ซอย${c.soi.replace(/^ซ(อย|\.)\s*/, "")}`,
    c.yaek && `แยก${c.yaek.replace(/^แยก\s*/, "")}`,
    c.road && `ถนน${c.road.replace(/^ถ(นน|\.)\s*/, "")}`,
    c.sub && `${bkk ? "แขวง" : "ตำบล"}${c.sub}`,
    c.dist && (bkk ? c.dist : `อำเภอ${c.dist}`),
    c.prov,
    c.post,
  ];
  return parts.filter(Boolean).join(" ").slice(0, 600);
}

async function main() {
  const { getPool, closePool } = await import("@/lib/db");
  const { isValidJuristicId } = await import("@/lib/juristic-id");
  const pool = getPool();
  type Row = import("mysql2").RowDataPacket;

  await pool.query(`DROP TABLE IF EXISTS juristic_vat_new`);
  await pool.query(`CREATE TABLE juristic_vat_new LIKE juristic_vat`);

  const INSERT = `INSERT IGNORE INTO juristic_vat_new (tax_id, branch_no, name, branch_name, address, province, post_code, approved_date) VALUES ?`;
  let total = 0;
  let skipped = 0;
  const sourceDates: string[] = [];

  for (const src of SOURCES) {
    const t0 = Date.now();
    const res = await fetch(src.url, { headers: { "User-Agent": "ThaiDataCorp/1.0 (+https://thaidatacorp.com)" } });
    if (!res.ok || !res.body) throw new Error(`${src.label}: HTTP ${res.status}`);
    sourceDates.push(res.headers.get("last-modified") ?? "");

    let decoder: TextDecoder | null = null;
    let buf = "";
    let header: string[] | null = null;
    let batch: unknown[][] = [];
    let kept = 0;
    const flush = async () => {
      if (!batch.length) return;
      await pool.query(INSERT, [batch]);
      batch = [];
    };

    const handle = async (line: string) => {
      if (!line.trim()) return;
      const cols = splitCsv(line);
      if (!header) {
        header = cols.map((h) => h.replace(/^﻿/, "").trim());
        return;
      }
      const h = header;
      const v = (name: string) => cols[h.indexOf(name)];
      const id = (v("เลขผู้เสียภาษีอากร") ?? "").trim().padStart(13, "0");
      const name = clean(v("ชื่อผู้ประกอบการ"));
      if (!/^0[1-9]\d{11}$/.test(id) || !isValidJuristicId(id) || (name && PERSON.test(name))) {
        skipped++;
        return;
      }
      const c: Addr = {
        building: clean(v("ชื่ออาคาร")),
        room: clean(v("เลขที่ห้อง")),
        floor: clean(v("ชั้นที่")),
        village: clean(v("ชื่อหมู่บ้าน")),
        no: clean(v("เลขที่ตั้ง")),
        moo: clean(v("หมู่")),
        soi: clean(v("ซอย")),
        yaek: clean(v("แยก")),
        road: clean(v("ถนน")),
        sub: clean(v("ตำบล")),
        dist: clean(v("อำเภอ")),
        prov: clean(v("จังหวัด"), 64),
        post: clean(v("รหัสไปรษณีย์"), 5),
      };
      batch.push([
        id,
        Number((v("เลขที่สาขา") ?? "0").trim()) || 0,
        name,
        clean(v("ชื่อสถานประกอบการ")),
        buildAddress(c),
        c.prov,
        c.post && /^\d{5}$/.test(c.post) ? c.post : null,
        beDate(v("วันที่ได้รับอนุมัติ")),
      ]);
      kept++;
      if (batch.length >= BATCH) await flush();
    };

    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        if (!decoder) {
          // ไฟล์กรุงเทพฯ เป็น TIS-620 ส่วนต่างจังหวัดเป็น UTF-8 (มี BOM) — ดูจาก byte แรก
          const utf8 = value[0] === 0xef && value[1] === 0xbb && value[2] === 0xbf;
          decoder = new TextDecoder(utf8 ? "utf-8" : "windows-874");
        }
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";
        for (const line of lines) await handle(line);
      }
      if (done) break;
    }
    if (decoder) buf += decoder.decode();
    await handle(buf);
    await flush();
    total += kept;
    console.log(`  ✓ ${src.label}: ${kept.toLocaleString()} สาขา (${((Date.now() - t0) / 1000).toFixed(0)} วินาที)`);
  }

  const [[prev]] = await pool.query<Row[]>(`SELECT COUNT(*) n FROM juristic_vat`);
  const prevN = Number(prev.n);
  if (total === 0 || (prevN > 0 && total < prevN * MIN_RATIO)) {
    await pool.query(`DROP TABLE juristic_vat_new`);
    throw new Error(`ได้ ${total.toLocaleString()} แถว น้อยกว่ารอบก่อน (${prevN.toLocaleString()}) ผิดปกติ — ไม่สลับตาราง`);
  }
  await pool.query(`DROP TABLE IF EXISTS juristic_vat_old`);
  await pool.query(`RENAME TABLE juristic_vat TO juristic_vat_old, juristic_vat_new TO juristic_vat`);
  await pool.query(`DROP TABLE juristic_vat_old`);

  // วันที่ของไฟล์ต้นทาง (ใหม่สุด) — หน้าเว็บแสดงเป็น "ข้อมูล ณ"
  const newest = sourceDates
    .map((d) => Date.parse(d))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  const settings: Array<[string, string]> = [
    ["vat_source_date", newest ? new Date(newest).toISOString().slice(0, 10) : ""],
    ["vat_synced_at", new Date().toISOString().slice(0, 19).replace("T", " ")],
  ];
  for (const [k, v] of settings) {
    await pool.query(`INSERT INTO app_setting (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)`, [k, v]);
  }
  console.log(`✔ เสร็จ — นิติบุคคล ${total.toLocaleString()} สาขา (ข้ามบุคคลธรรมดา/เลขที่ไม่ใช่นิติบุคคล ${skipped.toLocaleString()} แถว)`);
  await closePool();
}

main().catch((err) => {
  console.error("✖ sync-vat failed:", err);
  process.exit(1);
});
