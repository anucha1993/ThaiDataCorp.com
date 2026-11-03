/** สินค้า Shopee Affiliate (ตาราง affiliate_product) */
import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import type { AdProduct } from "@/lib/ads-config";
import type { AffiliateRow } from "@/lib/affiliate-csv";

export interface AffiliateProduct extends AdProduct {
  commission: string | null;
  productUrl: string | null;
  offerUrl: string;
  active: boolean;
  clicks: number;
  createdAt: string;
}

const toProduct = (r: RowDataPacket): AffiliateProduct => ({
  id: r.id,
  name: r.name,
  price: r.price,
  shop: r.shop,
  imageUrl: r.image_url,
  commission: r.commission,
  productUrl: r.product_url,
  offerUrl: r.offer_url,
  active: Boolean(r.active),
  clicks: Number(r.clicks),
  createdAt: String(r.created_at),
});

/** สุ่มสินค้าที่เปิดอยู่ */
export async function pickProducts(n: number): Promise<AdProduct[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT id, name, price, shop, image_url FROM affiliate_product WHERE active = 1 ORDER BY RAND() LIMIT ?`,
    [n],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, price: r.price, shop: r.shop, imageUrl: r.image_url }));
}

export async function listProducts(): Promise<AffiliateProduct[]> {
  const rows = await dbQuery<RowDataPacket[]>(`SELECT * FROM affiliate_product ORDER BY active DESC, id DESC`);
  return rows.map(toProduct);
}

/** ลิงก์ปลายทาง (+ นับคลิกถ้า count) — null = ไม่มี/ปิดอยู่ */
export async function clickProduct(id: number, count: boolean): Promise<string | null> {
  const rows = await dbQuery<RowDataPacket[]>(`SELECT offer_url FROM affiliate_product WHERE id = ? AND active = 1`, [id]);
  if (!rows[0]) return null;
  if (count) await dbQuery(`UPDATE affiliate_product SET clicks = clicks + 1 WHERE id = ?`, [id]);
  return rows[0].offer_url as string;
}

/** เพิ่มจากไฟล์ CSV — สินค้าเดิม (Item Id ซ้ำ) อัปเดตข้อมูลและลิงก์ใหม่ แต่คงจำนวนคลิกไว้ */
export async function importProducts(rows: AffiliateRow[]): Promise<{ added: number; updated: number }> {
  let added = 0;
  let updated = 0;
  for (const r of rows) {
    const res = await dbQuery<ResultSetHeader>(
      `INSERT INTO affiliate_product (item_id, name, price, shop, commission, image_url, product_url, offer_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), shop = VALUES(shop), commission = VALUES(commission),
         image_url = COALESCE(VALUES(image_url), image_url), product_url = VALUES(product_url), offer_url = VALUES(offer_url), active = 1`,
      [r.itemId, r.name, r.price, r.shop, r.commission, r.imageUrl, r.productUrl, r.offerUrl],
    );
    // MySQL: 1 = เพิ่มใหม่, 2 = อัปเดต, 0 = เหมือนเดิม
    if (res.affectedRows === 1) added++;
    else if (res.affectedRows === 2) updated++;
  }
  return { added, updated };
}

export async function setProductActive(id: number, active: boolean): Promise<void> {
  await dbQuery(`UPDATE affiliate_product SET active = ? WHERE id = ?`, [active ? 1 : 0, id]);
}

export async function setProductImage(id: number, imageUrl: string | null): Promise<void> {
  await dbQuery(`UPDATE affiliate_product SET image_url = ? WHERE id = ?`, [imageUrl, id]);
}

export async function deleteProduct(id: number): Promise<void> {
  await dbQuery(`DELETE FROM affiliate_product WHERE id = ?`, [id]);
}

export async function deleteAllProducts(): Promise<void> {
  await dbQuery(`DELETE FROM affiliate_product`);
}
