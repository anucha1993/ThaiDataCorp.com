/**
 * ดาวน์โหลดรายชื่อบริษัทเปิดใหม่เป็น CSV — /export/new?ym=2569-01&province=ชลบุรี&tsic=41002
 * ต้องเป็นสมาชิก Pro ขึ้นไป (จำนวนแถวสูงสุดตามแพ็กเกจ)
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { listJuristicWhere } from "@/lib/company-repo";
import { parseMonth } from "@/lib/new-repo";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ym = url.searchParams.get("ym") ?? "";
  const province = url.searchParams.get("province") || undefined;
  const tsic = url.searchParams.get("tsic") || undefined;
  const back = `/new/${ym}${province ? `/${encodeURIComponent(province)}` : ""}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (user.plan.exportRows === 0) redirect("/pricing?need=export");

  const m = parseMonth(ym);
  if (!m || (tsic && !/^\d{5}$/.test(tsic))) return new Response("Bad request", { status: 400 });

  const where = [`j.register_date >= ?`, `j.register_date < ?`];
  const params: unknown[] = [m.start, m.end];
  if (province) (where.push(`j.province = ?`), params.push(province));
  if (tsic) (where.push(`j.tsic_code = ?`), params.push(tsic));
  const rows = await listJuristicWhere(where.join(" AND "), params, `j.register_date DESC, j.id DESC`, user.plan.exportRows);

  const csv = toCsv(
    ["เลขทะเบียน", "ชื่อนิติบุคคล", "ประเภท", "วันจดทะเบียน", "ทุนจดทะเบียน", "รหัส TSIC", "ประเภทธุรกิจ", "ที่ตั้ง", "จังหวัด", "สถานะ", "แหล่งข้อมูล"],
    rows.map((p) => [
      p.id, p.nameTh, p.type, p.registerDate, p.registerCapital, p.tsic?.code, p.tsic?.description, p.address.full,
      p.address.province, p.statusText, "กรมพัฒนาธุรกิจการค้า (data.go.th) ผ่าน ThaiDataCorp",
    ]),
  );
  return csvResponse(`thaidatacorp-new-${ym}${province ? `-${province}` : ""}${tsic ? `-${tsic}` : ""}.csv`, csv);
}
