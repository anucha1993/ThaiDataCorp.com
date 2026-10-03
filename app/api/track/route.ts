/**
 * รับการเข้าชมจาก components/PageTracker (navigator.sendBeacon) — หน้าเว็บส่วนใหญ่เป็น static/ISR
 * จึงนับฝั่ง browser แทนการนับตอน render · IP เก็บ 90 วัน · คุกกี้ tdc_vid เฉพาะผู้ยอมรับคุกกี้สถิติ (ดู lib/analytics.ts)
 */
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { classify, isBot, parseUa, purgeOldViews, recordView, visitorHash } from "@/lib/analytics";
import { SITE_URL } from "@/lib/format";

const SKIP = /^\/(admin|api|_next|auth|export|login|register|account|pay|media)(\/|$)|^\/business\//;
const OWN_HOSTS = new Set([new URL(SITE_URL).hostname, `www.${new URL(SITE_URL).hostname}`, "localhost"]);

export async function POST(req: Request) {
  try {
    const h = await headers();
    const ua = h.get("user-agent") ?? "";
    if (isBot(ua)) return new Response(null, { status: 204 });

    const body = (await req.json().catch(() => null)) as { p?: string; r?: string } | null;
    const raw = String(body?.p ?? "");
    if (!raw.startsWith("/") || raw.length > 1000) return new Response(null, { status: 204 });
    const url = new URL(raw, SITE_URL);
    if (SKIP.test(url.pathname)) return new Response(null, { status: 204 });

    let referrer: string | null = null;
    try {
      const host = body?.r ? new URL(body.r).hostname.replace(/^www\./, "") : null;
      referrer = host && !OWN_HOSTS.has(host) && !OWN_HOSTS.has(`www.${host}`) ? host.slice(0, 255) : null;
    } catch {
      /* referrer ไม่ใช่ URL */
    }

    const jar = await cookies();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "0";
    const c = classify(url.pathname, url.searchParams);
    // หน้า /search เก็บ path พร้อมคำค้น (ไม่เก็บ query string อื่น เช่น page / ตัวกรอง)
    const path = (url.pathname === "/search" && c.query ? `/search?q=${c.query}` : url.pathname).slice(0, 500);
    await recordView({
      path,
      type: c.type,
      id: c.id,
      query: c.query,
      visitor: visitorHash(ip, ua),
      referrer,
      ...parseUa(ua),
      member: Boolean(jar.get(SESSION_COOKIE)?.value),
      ip: ip === "0" ? null : ip.slice(0, 45),
      // ใช้รหัสจากคุกกี้เฉพาะเมื่อผู้ใช้ยอมรับคุกกี้สถิติ
      vid: jar.get("tdc_consent")?.value === "all" && /^[A-Za-z0-9_-]{22}$/.test(jar.get("tdc_vid")?.value ?? "") ? jar.get("tdc_vid")!.value : null,
    });
    // ตัวสำรองลบ IP/ข้อมูลเก่า (~1 ใน 500 ครั้ง) — งานหลักคือ analytics-cleanup ใน /admin/jobs
    if (Math.random() < 0.002) purgeOldViews().catch(() => {});
  } catch (e) {
    console.error("[track] failed:", e);
  }
  return new Response(null, { status: 204 });
}
