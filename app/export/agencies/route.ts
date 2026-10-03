/**
 * ดาวน์โหลดรายชื่อหน่วยงานรัฐเป็น CSV — /export/agencies?<ตัวกรองเดียวกับหน้า /agency/search>
 * สำหรับสมาชิก (จำนวนแถวสูงสุดตามแพ็กเกจ)
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { agencyQuery, agencyRows, parseAgencyFilters } from "@/lib/procurement-search";

export async function GET(req: Request) {
  const f = parseAgencyFilters(Object.fromEntries(new URL(req.url).searchParams));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/agency/search?${agencyQuery(f)}`)}`);
  if (user.plan.exportRows === 0) redirect("/pricing?need=export");

  const rows = await agencyRows(f, user.plan.exportRows);
  const csv = toCsv(
    ["อันดับ", "หน่วยงาน", "จำนวนสัญญา", "มูลค่ารวม (บาท)", "จำนวนผู้รับสัญญา", "สัญญาประกวดราคา", "จังหวัดหลัก", "แหล่งข้อมูล"],
    rows.map((r, i) => [
      i + 1, r.agency, r.contracts, r.total_value, r.winners, r.ebid_contracts, r.top_province,
      "ระบบ e-GP (สพร., data.go.th, CC-BY) ผ่าน ThaiDataCorp",
    ]),
  );
  return csvResponse("thaidatacorp-agencies.csv", csv);
}
