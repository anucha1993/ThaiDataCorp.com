/**
 * Sync รายชื่อผู้ได้รับใบอนุญาต มอก. (สำนักงานมาตรฐานผลิตภัณฑ์อุตสาหกรรม) → ตาราง juristic_tisi
 *
 *   npm run sync:tisi
 *
 * แหล่งข้อมูล: data.go.th ชุด lic_* ของ สมอ. (CC-BY) — ไฟล์รวม lic_tis_total (หยุดอัปเดต ณ ก.ย. 2568)
 *   + ไฟล์แยกหมวดสินค้า (lic_helmet, lic_solar, ...) ที่ยังอัปเดตทุกเดือน → ใช้ไฟล์ล่าสุดของแต่ละชุด
 *   เลขใบอนุญาตซ้ำกัน → ใช้แถวจากไฟล์ที่ใหม่กว่า
 * เก็บเฉพาะนิติบุคคล (เลขผู้เสียภาษี 13 หลักขึ้นต้น 0 ที่ checksum ถูก) — โหลดลงตารางใหม่แล้วสลับชื่อ (กันไฟล์ขาด)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const CKAN = "https://data.go.th/api/3/action";
const UA = { "User-Agent": "ThaiDataCorp/1.0 (+https://thaidatacorp.com)" };
const BATCH = 1_000;
const MIN_RATIO = 0.7;

type Res = { url: string; name: string; modified: string };

async function ckan<T>(action: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${CKAN}/${action}?${new URLSearchParams(params)}`, { headers: UA, signal: AbortSignal.timeout(60_000) });
  const body = (await res.json()) as { success: boolean; result: T };
  if (!body.success) throw new Error(`CKAN ${action} failed`);
  return body.result;
}

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
const isoDate = (s: string | undefined) => {
  const m = (s ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]) > 2400 ? Number(m[1]) - 543 : Number(m[1]);
  return y > 1950 && y < 2100 ? `${y}-${m[2]}-${m[3]}` : null;
};
const coord = (s: string | undefined, max: number) => {
  const n = Number((s ?? "").trim());
  return Number.isFinite(n) && n !== 0 && Math.abs(n) <= max ? n : null;
};

/** หาคอลัมน์จากหัวตาราง (ชื่อคอลัมน์แต่ละไฟล์ต่างกันเล็กน้อย เช่น "เลข มอก." / "เลขที่ มอก.") */
function columnIndex(header: string[]) {
  const find = (...keys: RegExp[]) => header.findIndex((h) => keys.some((k) => k.test(h)));
  return {
    license: find(/^เลขที่ใบอนุญาต/),
    issued: find(/^วันที่ออกใบอนุญาต/),
    type: find(/^ประเภท$/, /^ประเภทใบอนุญาต/),
    tisNo: find(/^เลข(ที่)?\s*มอก/),
    tisName: find(/^ชื่อ มอก\. ภาษาไทย/),
    group: find(/^กลุ่มผลิตภัณฑ์/),
    holder: find(/^ผู้รับใบอนุญาต/),
    taxId: find(/^เลขประจำตัวผู้เสียภาษี/),
    factory: find(/^ชื่อโรงงาน/),
    factoryReg: find(/^ทะเบียนโรงงาน/),
    address: find(/^ที่อยู่โรงงาน/),
    province: find(/^จังหวัด/),
    lat: find(/ละติจูด/),
    lon: find(/ลองจิจูด/),
  };
}

async function main() {
  const { getPool, closePool } = await import("@/lib/db");
  const { isValidJuristicId } = await import("@/lib/juristic-id");
  const pool = getPool();
  type Row = import("mysql2").RowDataPacket;

  // ทุกชุด lic_* ของ สมอ. → ไฟล์ CSV ล่าสุดของแต่ละชุด (ไฟล์รวมก่อน แล้วตามด้วยรายหมวดที่ใหม่กว่า)
  const search = await ckan<{ results: Array<{ name: string; resources: Array<{ format?: string; url: string; name?: string; last_modified?: string; created?: string }> }> }>(
    "package_search",
    { q: "name:lic_*", rows: "100" },
  );
  const sources: Res[] = search.results
    .filter((p) => p.name.startsWith("lic_"))
    .flatMap((p) => {
      const csv = p.resources
        .filter((r) => (r.format ?? "").toUpperCase() === "CSV")
        .sort((a, b) => (b.last_modified ?? b.created ?? "").localeCompare(a.last_modified ?? a.created ?? ""))[0];
      return csv ? [{ url: csv.url, name: `${p.name}: ${csv.name ?? ""}`, modified: csv.last_modified ?? csv.created ?? "" }] : [];
    })
    .sort((a, b) => a.modified.localeCompare(b.modified));
  if (!sources.length) throw new Error("ไม่พบชุดข้อมูล lic_* บน data.go.th");
  console.log(`▶ ${sources.length} ไฟล์ (เก่า → ใหม่)`);

  await pool.query(`DROP TABLE IF EXISTS juristic_tisi_new`);
  await pool.query(`CREATE TABLE juristic_tisi_new LIKE juristic_tisi`);
  // ไฟล์ใหม่กว่าเขียนทับเลขใบอนุญาตเดิม
  const UPSERT = `INSERT INTO juristic_tisi_new (license_no, tax_id, issued_date, license_type, tis_no, tis_name, product_group,
      factory_name, factory_reg, factory_address, province, lat, lon) VALUES ?
    ON DUPLICATE KEY UPDATE tax_id = VALUES(tax_id), issued_date = VALUES(issued_date), license_type = VALUES(license_type),
      tis_no = VALUES(tis_no), tis_name = VALUES(tis_name), product_group = VALUES(product_group), factory_name = VALUES(factory_name),
      factory_reg = VALUES(factory_reg), factory_address = VALUES(factory_address), province = VALUES(province), lat = VALUES(lat), lon = VALUES(lon)`;

  let kept = 0;
  let skipped = 0;
  for (const src of sources) {
    try {
      kept += await importSource(src);
    } catch (e) {
      // ไฟล์รูปแบบเก่า/เสีย → ข้ามไฟล์นั้น ไม่หยุดทั้งงาน
      console.warn(`  ! ${src.name}: ${(e as Error).message} — ข้ามไฟล์นี้`);
    }
  }

  async function importSource(src: Res): Promise<number> {
    const t0 = Date.now();
    const res = await fetch(src.url, { headers: UA, signal: AbortSignal.timeout(300_000) });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    let decoder: TextDecoder | null = null;
    let buf = "";
    let col: ReturnType<typeof columnIndex> | null = null;
    let batch: unknown[][] = [];
    let n = 0;
    const flush = async () => {
      if (batch.length) await pool.query(UPSERT, [batch]);
      batch = [];
    };
    const handle = async (line: string) => {
      if (!line.trim()) return;
      const cells = splitCsv(line);
      if (!col) {
        col = columnIndex(cells.map((h) => h.replace(/^﻿/, "").trim()));
        if (col.license < 0 || col.taxId < 0) throw new Error("หัวตารางไม่ตรงรูปแบบ");
        return;
      }
      const c = col;
      const v = (i: number) => (i >= 0 ? cells[i] : undefined);
      const taxId = (v(c.taxId) ?? "").replace(/\D/g, "").padStart(13, "0");
      const license = clean(v(c.license), 64);
      if (!license || !/^0[1-9]\d{11}$/.test(taxId) || !isValidJuristicId(taxId)) {
        skipped++;
        return;
      }
      batch.push([
        license,
        taxId,
        isoDate(v(c.issued)),
        clean(v(c.type), 32),
        clean(v(c.tisNo), 32),
        clean(v(c.tisName), 500),
        clean(v(c.group), 64),
        clean(v(c.factory)),
        clean(v(c.factoryReg), 64),
        clean(v(c.address), 600),
        clean(v(c.province), 64),
        coord(v(c.lat), 90),
        coord(v(c.lon), 180),
      ]);
      n++;
      if (batch.length >= BATCH) await flush();
    };
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        if (!decoder) {
          // บางไฟล์ UTF-8 (มี BOM) บางไฟล์ TIS-620
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
    console.log(`  ✓ ${src.name} — ${n.toLocaleString()} ใบอนุญาต (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    return n;
  }

  const [[cur]] = await pool.query<Row[]>(`SELECT COUNT(*) n FROM juristic_tisi`);
  const [[next]] = await pool.query<Row[]>(`SELECT COUNT(*) n FROM juristic_tisi_new`);
  const prevN = Number(cur.n);
  const total = Number(next.n);
  if (total === 0 || (prevN > 0 && total < prevN * MIN_RATIO)) {
    await pool.query(`DROP TABLE juristic_tisi_new`);
    throw new Error(`ได้ ${total.toLocaleString()} ใบอนุญาต น้อยกว่ารอบก่อน (${prevN.toLocaleString()}) ผิดปกติ — ไม่สลับตาราง`);
  }
  await pool.query(`DROP TABLE IF EXISTS juristic_tisi_old`);
  await pool.query(`RENAME TABLE juristic_tisi TO juristic_tisi_old, juristic_tisi_new TO juristic_tisi`);
  await pool.query(`DROP TABLE juristic_tisi_old`);

  const newest = sources[sources.length - 1].modified.slice(0, 10);
  for (const [k, v] of [
    ["tisi_source_date", newest],
    ["tisi_synced_at", new Date().toISOString().slice(0, 19).replace("T", " ")],
  ] as const) {
    await pool.query(`INSERT INTO app_setting (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)`, [k, v]);
  }
  const [[cos]] = await pool.query<Row[]>(`SELECT COUNT(DISTINCT tax_id) n FROM juristic_tisi`);
  console.log(
    `✔ เสร็จ — ${total.toLocaleString()} ใบอนุญาต ของนิติบุคคล ${Number(cos.n).toLocaleString()} ราย (อ่าน ${kept.toLocaleString()} แถว, ข้ามที่ไม่ใช่นิติบุคคล ${skipped.toLocaleString()})`,
  );
  await closePool();
}

main().catch((err) => {
  console.error("✖ sync-tisi failed:", err);
  process.exit(1);
});
