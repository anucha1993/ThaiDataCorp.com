import { SITE_URL } from "@/lib/format";

/**
 * redirect_uri ต้องตรงทุกตัวอักษรกับที่ตั้งไว้ใน Meta for Developers และต้องเหมือนกันทั้งตอนขอสิทธิ์และตอนแลก code
 * production ใช้ SITE_URL เสมอ (หลัง reverse proxy ของ Plesk request.url อาจเป็น http://localhost)
 */
export function facebookRedirectUri(requestUrl: string): string {
  const base = process.env.NODE_ENV === "production" ? SITE_URL : new URL(requestUrl).origin;
  return `${base}/auth/facebook/callback`;
}

export const OAUTH_COOKIE = "tdc_oauth";
