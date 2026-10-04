/**
 * /ads.txt — ประกาศผู้ขายโฆษณาที่ได้รับอนุญาต (AdSense แนะนำ/ตรวจสอบ) สร้างจาก Publisher ID ใน /admin/ads
 * f08c47fec0942fa0 = รหัส TAG-ID ของ Google (ค่าคงที่ตามเอกสาร AdSense)
 */
import { getAdsConfig } from "@/lib/ads";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = await getAdsConfig().catch(() => null);
  const lines = [
    ...(c?.publisherId ? [`google.com, ${c.publisherId.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0`] : []),
    ...String(c?.adsTxtExtra ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("<")),
  ];
  if (!lines.length) return new Response("# ThaiDataCorp has no authorized ad sellers yet\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  })
}
