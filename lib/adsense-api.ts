/**
 * AdSense Management API v2 — ดึงรายงานรายได้ (อ่านอย่างเดียว)
 * ไม่ import "server-only" เพื่อให้สคริปต์ sync-adsense ใช้ได้
 *
 * ตั้งค่าครั้งเดียวใน Google Cloud Console (โปรเจกต์เดียวกับ Google Login):
 *   1. APIs & Services → Library → เปิด "AdSense Management API"
 *   2. Credentials → OAuth client เดิม → Authorized redirect URIs เพิ่ม https://thaidatacorp.com/admin/ads/callback
 *   3. หน้า /admin/ads → "เชื่อมต่อบัญชี AdSense" (ล็อกอินด้วยบัญชี Google ที่เป็นเจ้าของ AdSense)
 * ระบบเก็บ refresh token ไว้ใน app_setting แล้วให้งาน sync-adsense ดึงรายงานทุกวันอัตโนมัติ
 */
import { SITE_URL } from "@/lib/format";

export const ADSENSE_OAUTH_COOKIE = "tdc_adsense_oauth";
export const ADSENSE_SCOPE = "https://www.googleapis.com/auth/adsense.readonly";
const API = "https://adsense.googleapis.com/v2";

export function adsenseRedirectUri(requestUrl: string): string {
  const base = process.env.NODE_ENV === "production" ? SITE_URL : new URL(requestUrl).origin;
  return `${base}/admin/ads/callback`;
}

export function adsenseAuthorizeUrl(state: string, redirectUri: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", ADSENSE_SCOPE);
  u.searchParams.set("state", state);
  // offline + consent → ได้ refresh token สำหรับให้ระบบดึงรายงานเองทุกวัน
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent select_account");
  return u.toString();
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...params,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google token: ${body.error_description ?? body.error ?? res.status}`);
  return body;
}

export async function adsenseExchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string | null }> {
  const b = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  return { accessToken: b.access_token!, refreshToken: b.refresh_token ?? null };
}

export async function adsenseAccessToken(refreshToken: string): Promise<string> {
  return (await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" })).access_token!;
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`AdSense API ${res.status}: ${body.error?.message ?? "error"}`);
  return body;
}

/** บัญชี AdSense แรกของผู้ใช้ เช่น { name: "accounts/pub-123", displayName } */
export async function adsenseFirstAccount(token: string): Promise<{ name: string; displayName?: string } | null> {
  const r = await api<{ accounts?: Array<{ name: string; displayName?: string }> }>(token, "accounts");
  return r.accounts?.[0] ?? null;
}

export type ReportRow = Record<string, string>;

/**
 * รายงานตามช่วงวันที่ (YYYY-MM-DD) — คืนแถวแบบ { DATE, AD_UNIT_NAME, ESTIMATED_EARNINGS, ... }
 * สกุลเงินบาท · เขตเวลาตามบัญชี AdSense
 */
export async function adsenseReport(
  token: string,
  account: string,
  from: string,
  to: string,
  dimensions: string[],
  metrics = ["ESTIMATED_EARNINGS", "PAGE_VIEWS", "IMPRESSIONS", "CLICKS"],
): Promise<ReportRow[]> {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const q = new URLSearchParams({
    dateRange: "CUSTOM",
    "startDate.year": String(fy),
    "startDate.month": String(fm),
    "startDate.day": String(fd),
    "endDate.year": String(ty),
    "endDate.month": String(tm),
    "endDate.day": String(td),
    currencyCode: "THB",
    reportingTimeZone: "ACCOUNT_TIME_ZONE",
  });
  for (const d of dimensions) q.append("dimensions", d);
  for (const m of metrics) q.append("metrics", m);
  const r = await api<{ headers?: Array<{ name: string }>; rows?: Array<{ cells: Array<{ value?: string }> }> }>(
    token,
    `${account}/reports:generate?${q}`,
  );
  const names = (r.headers ?? []).map((h) => h.name);
  return (r.rows ?? []).map((row) => Object.fromEntries(names.map((n, i) => [n, row.cells[i]?.value ?? ""])));
}
