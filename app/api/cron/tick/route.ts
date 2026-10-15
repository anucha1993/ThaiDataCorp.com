/**
 * ตัวจัดคิวงานแบบเรียกผ่าน URL — สำหรับ hosting ที่ Scheduled Task รันคำสั่งไม่ได้ (shell แบบ chroot)
 *
 *   Plesk → Scheduled Tasks → Fetch a URL ทุก 5 นาที:
 *   https://thaidatacorp.com/api/cron/tick?key=<CRON_SECRET>
 *
 * รันตัวจัดคิว (lib/jobs-tick.ts) ใน process ของเว็บ — ทำงานเหมือน `npm run jobs:tick`
 */
import { timingSafeEqual } from "node:crypto";
import { runJobsTick } from "@/lib/jobs-tick";

export const dynamic = "force-dynamic";

function validKey(given: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (secret.length < 16 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!validKey(new URL(request.url).searchParams.get("key"))) {
    return Response.json({ ok: false }, { status: 404 });
  }
  try {
    // รันตัวจัดคิวใน process ของเว็บเลย (ไม่แตก process ซ้อน) — งานที่เริ่มจากตรงนี้ไม่ถูกโฮสต์ปิดเหมือนปุ่ม "รันตอนนี้"
    const started = await runJobsTick();
    return Response.json({ ok: true, started }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] tick failed:", e);
    return Response.json({ ok: false, error: "tick" }, { status: 500 });
  }
}
