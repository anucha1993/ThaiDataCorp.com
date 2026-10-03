/**
 * เข้าสู่ระบบด้วย Google (OAuth 2.0 / OpenID Connect แบบ server-side)
 *
 * .env.local / Environment Variables ของ Plesk:
 *   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
 *   GOOGLE_CLIENT_SECRET=...
 *
 * ตั้งค่าใน Google Cloud Console → APIs & Services:
 *   OAuth consent screen: User type = External, scopes = email, profile, openid → Publish app
 *   Credentials → Create OAuth client ID → Web application
 *     Authorized JavaScript origins = https://thaidatacorp.com
 *     Authorized redirect URIs      = https://thaidatacorp.com/auth/google/callback
 *                                     (ตอนพัฒนาเพิ่ม http://localhost:3900/auth/google/callback)
 */

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleAuthorizeUrl(state: string, redirectUri: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  // ให้เลือกบัญชีทุกครั้ง (คนที่มีหลายบัญชี Gmail ในเบราว์เซอร์เดียว)
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

/** แลก code เป็น access token */
export async function googleExchangeCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google token exchange failed: ${body.error_description ?? body.error ?? res.status}`);
  return body.access_token;
}

/** ข้อมูลผู้ใช้ — sub คือรหัสถาวรของบัญชี Google · ส่งอีเมลกลับเฉพาะที่ Google ยืนยันแล้ว */
export async function googleProfile(accessToken: string): Promise<{ id: string; name?: string; email?: string }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { sub?: string; name?: string; email?: string; email_verified?: boolean };
  if (!res.ok || !body.sub) throw new Error(`Google userinfo failed: ${res.status}`);
  return { id: body.sub, name: body.name, email: body.email_verified ? body.email : undefined };
}
