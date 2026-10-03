/**
 * ดาวน์โหลดสัญญาจัดซื้อจัดจ้างภาครัฐเป็น CSV — /export/contracts?company=0105...  หรือ ?agency=กรมทางหลวง
 * เฉพาะแพ็กเกจ Business
 */
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { dbQuery } from "@/lib/db";
import { isValidJuristicId } from "@/lib/juristic-id";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const company = url.searchParams.get("company") || undefined;
  const agency = url.searchParams.get("agency") || undefined;
  const back = company ? `/company/${company}` : agency ? `/agency/${encodeURIComponent(agency)}` : "/procurement";

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!user.plan.exportContracts) redirect("/pricing?need=contracts");
  if ((!company && !agency) || (company && !isValidJuristicId(company))) return new Response("Bad request", { status: 400 });

  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT fiscal_year, project_id, project_name, project_type, agency, sub_agency, method, budget, ref_price,
       agreed_price, contract_value, province, district, winner_id, winner_name, contract_no, sign_date, end_date,
       contract_status
     FROM procurement_contract WHERE ${company ? "winner_id = ?" : "agency = ?"}
     ORDER BY sign_date DESC LIMIT ?`,
    [company ?? agency, user.plan.exportRows],
  );
  const csv = toCsv(
    ["ปีงบประมาณ", "รหัสโครงการ", "ชื่อโครงการ", "ประเภท", "หน่วยงาน", "หน่วยงานย่อย", "วิธีจัดซื้อ", "งบประมาณ", "ราคากลาง",
      "ราคาที่ตกลง", "มูลค่าสัญญา", "จังหวัด", "อำเภอ", "เลขนิติบุคคลผู้ชนะ", "ชื่อผู้ชนะ", "เลขที่สัญญา", "วันที่ลงนาม",
      "วันที่สิ้นสุด", "สถานะสัญญา", "แหล่งข้อมูล"],
    rows.map((r) => [
      r.fiscal_year, r.project_id, r.project_name, r.project_type, r.agency, r.sub_agency, r.method, r.budget, r.ref_price,
      r.agreed_price, r.contract_value, r.province, r.district, r.winner_id, r.winner_name, r.contract_no, r.sign_date,
      r.end_date, r.contract_status, "ระบบ e-GP (สพร., data.go.th, CC-BY) ผ่าน ThaiDataCorp",
    ]),
  );
  return csvResponse(`thaidatacorp-contracts-${company ?? agency}.csv`, csv);
}
