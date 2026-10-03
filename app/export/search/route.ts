/**
 * ดาวน์โหลดผลค้นหาขั้นสูงเป็น CSV — /export/search?<ตัวกรองเดียวกับหน้า /search>
 * สำหรับสมาชิก (จำนวนแถวสูงสุดตามแพ็กเกจ)
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { advancedSearchRows, filtersToQuery, parseFilters } from "@/lib/search-repo";

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = parseFilters(sp);
  const back = `/search?${filtersToQuery(f)}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (user.plan.exportRows === 0) redirect("/pricing?need=export");

  const rows = await advancedSearchRows(f, user.plan.exportRows);
  const csv = toCsv(
    ["เลขทะเบียน", "ชื่อนิติบุคคล", "ประเภท", "วันจดทะเบียน", "ทุนจดทะเบียน", "รหัส TSIC", "ประเภทธุรกิจ", "ที่ตั้ง", "จังหวัด", "สถานะ", "แหล่งข้อมูล"],
    rows.map((p) => [
      p.id, p.nameTh, p.type, p.registerDate, p.registerCapital, p.tsic?.code, p.tsic?.description, p.address.full,
      p.address.province, p.statusText, "กรมพัฒนาธุรกิจการค้า (data.go.th) ผ่าน ThaiDataCorp",
    ]),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`thaidatacorp-search-${stamp}.csv`, csv);
}
