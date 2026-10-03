/**
 * Data Deletion Request Callback ของ Facebook
 *   Meta for Developers → App settings → Basic → การลบข้อมูลผู้ใช้ → "URL ติดต่อกลับการลบข้อมูล"
 *   = https://thaidatacorp.com/auth/facebook/data-deletion
 *
 * เมื่อผู้ใช้ลบแอปจากฝั่ง Facebook แล้วกด "ขอลบข้อมูล" Facebook จะ POST signed_request มาที่นี่
 * เราตรวจลายเซ็นด้วย App Secret → ลบข้อมูลที่ได้จาก Facebook (การเชื่อมบัญชี + ชื่อ) → ตอบ URL สถานะ + รหัสยืนยัน
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { SITE_URL } from "@/lib/format";

function parseSignedRequest(signed: string): { user_id?: string } | null {
  const [sig, payload] = signed.split(".", 2);
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!sig || !payload || !secret) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const data = parseSignedRequest(String(form?.get("signed_request") ?? ""));
  if (!data?.user_id) return Response.json({ error: "invalid signed_request" }, { status: 400 });

  const uid = String(data.user_id);
  const [identity] = await dbQuery<RowDataPacket[]>(
    `SELECT user_id, name FROM user_identity WHERE provider = 'facebook' AND provider_uid = ?`,
    [uid],
  );
  if (identity) {
    await dbQuery(`DELETE FROM user_identity WHERE provider = 'facebook' AND provider_uid = ?`, [uid]);
    // ชื่อที่แสดงได้มาจาก Facebook → ลบด้วย
    if (identity.name) await dbQuery(`UPDATE app_user SET display_name = NULL WHERE id = ? AND display_name = ?`, [identity.user_id, identity.name]);
  }
  await dbQuery(`DELETE FROM oauth_pending WHERE provider = 'facebook' AND provider_uid = ?`, [uid]);

  const code = randomBytes(6).toString("hex").toUpperCase();
  console.log(`[facebook] data deletion request uid=${uid} code=${code} linked=${Boolean(identity)}`);
  return Response.json({ url: `${SITE_URL}/data-deletion?code=${code}`, confirmation_code: code });
}
