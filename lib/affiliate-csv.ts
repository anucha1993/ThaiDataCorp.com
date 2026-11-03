/**
 * อ่านไฟล์ CSV ลิงก์สินค้าจาก Shopee Affiliate (affiliate.shopee.co.th → สร้างลิงก์หลายรายการ → ดาวน์โหลด)
 * หาคอลัมน์จากชื่อหัวตาราง (ไทย/อังกฤษ) — ไม่ผูกกับลำดับคอลัมน์ ไฟล์จาก Shopee เปลี่ยนรูปแบบได้
 * ไม่มี I/O
 */

export interface AffiliateRow {
  itemId: string | null;
  name: string;
  price: string | null;
  shop: string | null;
  commission: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  offerUrl: string;
}

export interface ParseResult {
  rows: AffiliateRow[];
  /** แถวที่ข้าม (ไม่มีชื่อหรือลิงก์) */
  skipped: number;
  /** หัวตารางที่พบ — แสดงให้ผู้ดูแลเห็นเมื่อ import ไม่ได้ */
  headers: string[];
}

/** แยก CSV ตาม RFC 4180 (รองรับ "..." ที่มี , และขึ้นบรรทัดใหม่ข้างใน) */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = (src.split(/\r?\n/, 1)[0].match(/\t/g)?.length ?? 0) > (src.split(/\r?\n/, 1)[0].match(/,/g)?.length ?? 0) ? "\t" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((v) => v.trim()));
}

const norm = (h: string) => h.toLowerCase().replace(/[\s_\-()]/g, "");

/** คอลัมน์แรกที่ชื่อตรงกับ pattern ใดก็ได้ */
function findCol(headers: string[], patterns: RegExp[], exclude: number[] = []): number {
  for (const p of patterns) {
    const i = headers.findIndex((h, idx) => !exclude.includes(idx) && p.test(norm(h)));
    if (i >= 0) return i;
  }
  return -1;
}

const isUrl = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());
/** ลิงก์ affiliate ของ Shopee (ลิงก์สั้นที่นับค่าคอม) */
const isOfferUrl = (v: string) => /^https?:\/\/(s\.shopee\.co\.th|shope\.ee|shp\.ee)\//i.test(v.trim());

export function parseAffiliateCsv(text: string): ParseResult {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], skipped: 0, headers: table[0] ?? [] };
  const [headers, ...data] = table;

  let offer = findCol(headers, [/offerlink/, /affiliatelink/, /shortlink/, /customlink/, /ลิงก์ที่กำหนดเอง/, /ลิงก์แอฟ/, /ลิงก์ย่อ/, /ลิงก์ข้อเสนอ/]);
  // ไม่เจอจากชื่อ → หาคอลัมน์ที่ค่าเป็นลิงก์สั้นของ Shopee
  if (offer < 0) offer = headers.findIndex((_, i) => data.slice(0, 20).some((r) => isOfferUrl(r[i] ?? "")));
  const product = findCol(headers, [/productlink/, /itemlink/, /producturl/, /ลิงก์สินค้า/, /^link$/, /^url$/], [offer]);
  const name = findCol(headers, [/itemname/, /productname/, /ชื่อสินค้า/, /^name$/, /^title$/, /ชื่อ/]);
  const itemId = findCol(headers, [/itemid/, /productid/, /รหัสสินค้า/, /^id$/]);
  const price = findCol(headers, [/^price/, /ราคา/]);
  const shop = findCol(headers, [/shopname/, /^shop/, /ร้าน/]);
  const commission = findCol(headers, [/commissionrate/, /อัตราค่าคอม/, /อัตราคอม/]);
  const image = findCol(headers, [/image/, /รูป/, /ภาพ/]);

  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const rows: AffiliateRow[] = [];
  let skipped = 0;
  for (const r of data) {
    const offerUrl = get(r, offer) || get(r, product);
    const n = get(r, name);
    if (!n || !isUrl(offerUrl)) {
      skipped++;
      continue;
    }
    const productUrl = get(r, product);
    const imageUrl = get(r, image);
    rows.push({
      itemId: get(r, itemId).replace(/\D/g, "").slice(0, 32) || productUrl.match(/i\.\d+\.(\d+)/)?.[1] || null,
      name: n.slice(0, 500),
      price: get(r, price).slice(0, 64) || null,
      shop: get(r, shop).slice(0, 255) || null,
      commission: get(r, commission).slice(0, 32) || null,
      imageUrl: isUrl(imageUrl) ? imageUrl.slice(0, 1000) : null,
      productUrl: isUrl(productUrl) ? productUrl.slice(0, 1000) : null,
      offerUrl: offerUrl.slice(0, 1000),
    });
  }
  return { rows, skipped, headers };
}
