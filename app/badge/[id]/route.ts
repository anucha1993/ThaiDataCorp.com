/**
 * ป้าย "ยืนยันบริษัทแล้ว" สำหรับให้บริษัทนำไปติดบนเว็บไซต์ของตัวเอง — /badge/{เลขทะเบียน}.svg
 *
 * แสดงเฉพาะบริษัทที่ยืนยันตัวตนแล้ว และไม่ถูกผู้ดูแลระงับ — ถ้าภายหลังถูกยกเลิก/ระงับ ป้ายจะหายเอง (404)
 * cache สั้นพอให้การยกเลิกมีผลภายในวันเดียว
 */
import { getProfile, isVerifiedCompany } from "@/lib/business";
import { isValidJuristicId } from "@/lib/juristic-id";

export const dynamic = "force-dynamic";

function badgeSvg(id: string): string {
  // ตัวอักษรไทยใช้ฟอนต์ของเครื่องผู้ชม (Tahoma/Leelawadee/Noto มีทุกระบบปฏิบัติการ)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="236" height="44" viewBox="0 0 236 44" role="img" aria-label="ยืนยันบริษัทแล้วโดย ThaiDataCorp">
  <title>ยืนยันบริษัทแล้วโดย ThaiDataCorp — เลขทะเบียน ${id}</title>
  <rect width="236" height="44" rx="5" fill="#ffffff" stroke="#a2a9b1"/>
  <rect x="1" y="1" width="42" height="42" rx="4" fill="#14866d"/>
  <path d="M13 22.5l6 6 12-13" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="52" y="19" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', sans-serif" font-size="13" font-weight="bold" fill="#14866d">ยืนยันบริษัทแล้ว</text>
  <text x="52" y="35" font-family="Tahoma, 'Leelawadee UI', 'Noto Sans Thai', sans-serif" font-size="11" fill="#54595d">ตรวจสอบโดย ThaiDataCorp.com</text>
</svg>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id.replace(/\.svg$/i, "");
  const ok = isValidJuristicId(id) && (await isVerifiedCompany(id).catch(() => false)) && !(await getProfile(id).catch(() => null))?.hidden;
  if (!ok) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  return new Response(badgeSvg(id), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=21600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
