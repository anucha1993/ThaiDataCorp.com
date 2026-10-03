/**
 * ตัวจัดคิวงานแบบเรียกผ่าน URL — สำหรับ hosting ที่ Scheduled Task รันคำสั่งไม่ได้ (shell แบบ chroot)
 *
 *   Plesk → Scheduled Tasks → Fetch a URL ทุก 5 นาที:
 *   https://thaidatacorp.com/api/cron/tick?key=<CRON_SECRET>
 *
 * เริ่ม scripts/jobs-tick.ts แบบแยก process (ไม่รอให้จบ) — ทำงานเหมือน `npm run jobs:tick`
 */
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";

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
    const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const child = spawn(process.execPath, [tsxCli, path.join("scripts", "jobs-tick.ts")], {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", (e) => console.error("[cron] tick spawn error:", e));
    child.unref();
    return Response.json({ ok: true, pid: child.pid ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] tick failed to start:", e);
    return Response.json({ ok: false, error: "spawn" }, { status: 500 });
  }
}
