/**
 * ดาวน์โหลดรายชื่อผู้รับงานภาครัฐเป็น CSV — /export/winners?<ตัวกรองเดียวกับหน้า /procurement/winners>
 * สำหรับสมาชิก (จำนวนแถวสูงสุดตามแพ็กเกจ)
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { parseWinnerFilters, winnerQuery, winnerRows } from "@/lib/procurement-search";

export async function GET(req: Request) {
  const f = parseWinnerFilters(Object.fromEntries(new URL(req.url).searchParams));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/procurement/winners?${winnerQuery(f)}`)}`);
  if (user.plan.exportRows === 0) redirect("/pricing?need=export");

  const rows = await winnerRows(f, user.plan.exportRows);
  const csv = toCsv(
    ["อันดับ", "เลขนิติบุคคล", "ชื่อผู้รับสัญญา", `จำนวนสัญญา${f.province ? ` (${f.province})` : ""}`, "มูลค่ารวม (บาท)",
      "จำนวนหน่วยงาน (ทั้งประเทศ)", "ลงนามครั้งแรก", "ลงนามล่าสุด", "แหล่งข้อมูล"],
    rows.map((r, i) => [
      i + 1, r.winner_id, r.winner_name, r.contracts, r.total_value, r.agencies, r.first_sign, r.last_sign,
      "ระบบ e-GP (สพร., data.go.th, CC-BY) ผ่าน ThaiDataCorp",
    ]),
  );
  return csvResponse(`thaidatacorp-winners${f.province ? `-${f.province}` : ""}.csv`, csv);
}
