/**
 * ไฟล์ที่ผู้ใช้อัปโหลด — เก็บนอกโฟลเดอร์ public (Next.js ไม่เสิร์ฟไฟล์ public ที่เพิ่มหลัง build)
 *
 *   รูปสาธารณะ (โลโก้ / รูปข่าว) → Cloudflare R2 (ถ้าตั้งค่า R2_*) ไม่งั้น storage/public/ — เสิร์ฟผ่าน /media/<path> เสมอ
 *   storage/private/  เอกสารยืนยันบริษัท → เปิดได้เฉพาะผู้ดูแล (/admin/business/doc) และลบทิ้งเมื่อพิจารณาเสร็จ
 *
 * ตั้งตำแหน่งได้ด้วย STORAGE_DIR (ค่าเริ่มต้น <app>/storage) — บน Plesk อยู่ใน httpdocs/storage ซึ่งไม่อยู่ใต้ document root (/public)
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { isR2Configured, r2Delete, r2Get, r2Put } from "@/lib/r2";

export const STORAGE_DIR = process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");
const PUBLIC_DIR = path.join(STORAGE_DIR, "public");
const PRIVATE_DIR = path.join(STORAGE_DIR, "private");

const MB = 1024 * 1024;
/** โลโก้ / รูปข่าว / รูปประกอบประกาศงาน */
export const MAX_IMAGE_BYTES = 3 * MB;
export const MAX_DOC_BYTES = 10 * MB;
/** เอกสารยืนยันบริษัทรวมทุกไฟล์ (ต่ำกว่า serverActions.bodySizeLimit 25MB เผื่อข้อมูลฟอร์ม) */
export const MAX_CLAIM_TOTAL_BYTES = 20 * MB;
/** ความละเอียดสูงสุดของรูป — กันไฟล์ที่บีบอัดมาให้แตกตัวใหญ่ผิดปกติ (decompression bomb) */
const MAX_PIXELS = 40_000_000;

/** ชื่อไฟล์ที่เราสร้างเอง: <หมวด>/<uuid>.<ext> — กัน path traversal เวลาอ่านกลับ */
const SAFE_NAME = /^[a-z]+\/[0-9a-f-]{36}\.(webp|pdf|jpg|png)$/;
export const isSafeName = (name: string) => SAFE_NAME.test(name);

function sniff(buf: Buffer): "pdf" | "jpg" | "png" | "webp" | "gif" | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "gif";
  return null;
}

export type UploadError = "empty" | "too-large" | "bad-type" | "bad-image";

/**
 * รูปภาพสาธารณะ (โลโก้ / รูปข่าว): ตรวจชนิดจากเนื้อไฟล์จริง → ย่อ → แปลงเป็น WebP (ตัด EXIF/GPS ทิ้ง)
 */
export async function saveImage(file: File, kind: "logo" | "news" | "job", maxSize: number): Promise<{ name: string } | { error: UploadError }> {
  if (!file || file.size === 0) return { error: "empty" };
  if (file.size > MAX_IMAGE_BYTES) return { error: "too-large" };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  // รับเฉพาะ JPG / PNG / WebP (ตรวจจากเนื้อไฟล์ ไม่เชื่อนามสกุล)
  if (type !== "jpg" && type !== "png" && type !== "webp") return { error: "bad-type" };
  let out: Buffer;
  try {
    out = await sharp(buf, { animated: false, limitInputPixels: MAX_PIXELS })
      .rotate() // หมุนตาม EXIF แล้วค่อยตัด metadata ทิ้ง
      .resize(maxSize, maxSize, { fit: kind === "logo" ? "inside" : "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { error: "bad-image" };
  }
  const name = `${kind}/${randomUUID()}.webp`;
  if (isR2Configured()) {
    await r2Put(name, out, "image/webp", "public, max-age=31536000, immutable");
  } else {
    await mkdir(path.join(PUBLIC_DIR, kind), { recursive: true });
    await writeFile(path.join(PUBLIC_DIR, name), out);
  }
  return { name };
}

/** เอกสารยืนยันตัวตน (PDF / JPG / PNG) เก็บแบบส่วนตัว */
export async function saveDocument(file: File): Promise<{ name: string } | { error: UploadError }> {
  if (!file || file.size === 0) return { error: "empty" };
  if (file.size > MAX_DOC_BYTES) return { error: "too-large" };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (type !== "pdf" && type !== "jpg" && type !== "png") return { error: "bad-type" };
  const name = `claims/${randomUUID()}.${type}`;
  await mkdir(path.join(PRIVATE_DIR, "claims"), { recursive: true });
  await writeFile(path.join(PRIVATE_DIR, name), buf);
  return { name };
}

const MIME: Record<string, string> = { webp: "image/webp", pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };

export async function readStored(scope: "public" | "private", name: string): Promise<{ body: Buffer; type: string } | null> {
  if (!isSafeName(name)) return null;
  // รูปสาธารณะอยู่ใน R2 — ถ้าไม่พบ ลองในเครื่อง (ไฟล์ที่อัปโหลดก่อนย้ายไป R2)
  if (scope === "public" && isR2Configured()) {
    const obj = await r2Get(name).catch((e) => (console.error("[uploads] r2 get failed:", e), null));
    if (obj) return { body: obj.body, type: MIME[name.split(".").pop() ?? ""] ?? obj.type };
  }
  try {
    const body = await readFile(path.join(scope === "public" ? PUBLIC_DIR : PRIVATE_DIR, name));
    return { body, type: MIME[name.split(".").pop() ?? ""] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function deleteStored(scope: "public" | "private", name: string | null | undefined): Promise<void> {
  if (!name || !isSafeName(name)) return;
  if (scope === "public" && isR2Configured()) await r2Delete(name).catch((e) => console.error("[uploads] r2 delete failed:", e));
  await unlink(path.join(scope === "public" ? PUBLIC_DIR : PRIVATE_DIR, name)).catch(() => {});
}

export const mediaUrl = (name: string | null | undefined) => (name ? `/media/${name}` : null);
