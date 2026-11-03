/**
 * ลิงก์สินค้า Shopee Affiliate: นับคลิกแล้วส่งต่อไปลิงก์ affiliate (302)
 * robots.txt ห้าม crawl /go/ และบอตไม่ถูกนับ
 */
import { headers } from "next/headers";
import { isBot } from "@/lib/analytics";
import { clickProduct } from "@/lib/affiliate-repo";
import { SITE_URL } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  const url = Number.isInteger(n) && n > 0 ? await clickProduct(n, !isBot((await headers()).get("user-agent") ?? "")).catch(() => null) : null;
  return Response.redirect(url ?? `${SITE_URL}/`, 302);
}
