/**
 * ปลายทางของฟอร์มตัวกรองบริษัทเปิดใหม่ (HTML form ล้วน ไม่ต้องใช้ JavaScript)
 *   /new/go?ym=2569-09&province=ชลบุรี&tsic=41001 → /new/2569-09/ชลบุรี?tsic=41001
 */
import { redirect } from "next/navigation";
import { newUrl } from "@/app/new/view";
import { parseMonth } from "@/lib/new-repo";

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ym = q.get("ym") ?? "";
  if (!parseMonth(ym)) redirect("/new");
  const province = q.get("province")?.trim().slice(0, 100) || undefined;
  const tsic = q.get("tsic") ?? "";
  redirect(newUrl(ym, province, { tsic: /^\d{5}$/.test(tsic) ? tsic : undefined }));
}
