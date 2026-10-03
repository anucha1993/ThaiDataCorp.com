/**
 * Facebook Login (OAuth 2.0 แบบ server-side)
 *
 * .env.local / Environment Variables ของ Plesk:
 *   FACEBOOK_APP_ID=...
 *   FACEBOOK_APP_SECRET=...
 *   FACEBOOK_GRAPH_VERSION=v25.0     # ไม่บังคับ
 *
 * ตั้งค่าใน Meta for Developers (Facebook Login → Settings):
 *   Valid OAuth Redirect URIs = https://thaidatacorp.com/auth/facebook/callback
 *   (ตอนพัฒนา Facebook อนุญาต http://localhost:3900/auth/facebook/callback อัตโนมัติเมื่อแอปอยู่ในโหมด Development)
 *   Privacy Policy URL = https://thaidatacorp.com/terms
 *   Data Deletion Instructions URL = https://thaidatacorp.com/data-deletion
 */
import { createHmac } from "node:crypto";

const GRAPH = () => `https://graph.facebook.com/${process.env.FACEBOOK_GRAPH_VERSION ?? "v25.0"}`;
const DIALOG = () => `https://www.facebook.com/${process.env.FACEBOOK_GRAPH_VERSION ?? "v25.0"}/dialog/oauth`;

export function isFacebookConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

export function facebookAuthorizeUrl(state: string, redirectUri: string): string {
  const u = new URL(DIALOG());
  u.searchParams.set("client_id", process.env.FACEBOOK_APP_ID ?? "");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "email,public_profile");
  return u.toString();
}

/** แลก code เป็น access token */
export async function facebookExchangeCode(code: string, redirectUri: string): Promise<string> {
  const u = new URL(`${GRAPH()}/oauth/access_token`);
  u.searchParams.set("client_id", process.env.FACEBOOK_APP_ID ?? "");
  u.searchParams.set("client_secret", process.env.FACEBOOK_APP_SECRET ?? "");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code", code);
  const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const body = (await res.json()) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !body.access_token) throw new Error(`Facebook token exchange failed: ${body.error?.message ?? res.status}`);
  return body.access_token;
}

/** ข้อมูลผู้ใช้ — id เป็น app-scoped (ต่างกันในแต่ละแอป) · email มีเฉพาะเมื่อผู้ใช้อนุญาตและยืนยันอีเมลแล้ว */
export async function facebookProfile(accessToken: string): Promise<{ id: string; name?: string; email?: string }> {
  const u = new URL(`${GRAPH()}/me`);
  u.searchParams.set("fields", "id,name,email");
  u.searchParams.set("access_token", accessToken);
  // appsecret_proof: ยืนยันว่าคำขอมาจากเซิร์ฟเวอร์ของเรา (กันกรณี token รั่ว)
  u.searchParams.set("appsecret_proof", createHmac("sha256", process.env.FACEBOOK_APP_SECRET ?? "").update(accessToken).digest("hex"));
  const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const body = (await res.json()) as { id?: string; name?: string; email?: string; error?: { message?: string } };
  if (!res.ok || !body.id) throw new Error(`Facebook profile failed: ${body.error?.message ?? res.status}`);
  return { id: body.id, name: body.name, email: body.email };
}
