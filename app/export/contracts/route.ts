/**
 * ดาวน์โหลดสัญญาจัดซื้อจัดจ้างภาครัฐเป็น CSV
 *   /export/contracts?company=0105...        สัญญาของบริษัท (ลิงก์จากหน้าบริษัท)
 *   /export/contracts?agency=กรมทางหลวง      สัญญาของหน่วยงาน
 *   /export/contracts?<ตัวกรองเดียวกับหน้า /procurement/contracts>
 * สำหรับสมาชิกที่แพ็กเกจเปิดสิทธิ์ดาวน์โหลดสัญญา
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { contractQuery, contractRows, hasContractFilter, parseContractFilters } from "@/lib/procurement-search";

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  // ลิงก์เดิมจากหน้าบริษัทใช้ ?company= → เท่ากับตัวกรองผู้รับสัญญา
  if (sp.company && !sp.winner) sp.winner = sp.company;
  const f = parseContractFilters(sp);
  const back = `/procurement/contracts?${contractQuery(f)}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!user.plan.exportContracts) redirect("/pricing?need=contracts");
  if (!hasContractFilter(f)) redirect(back);

  const rows = await contractRows(f, user.plan.exportRows);
  if (!rows) {
    return new Response("ตัวกรองกว้างเกินไป กรุณาเพิ่มตัวกรอง (หน่วยงาน ผู้รับสัญญา หรือช่วงวันที่) แล้วลองใหม่", {
      status: 422,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
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
  const label = f.winner?.replace(/\D/g, "").length === 13 ? f.winner : f.agency ?? new Date().toISOString().slice(0, 10);
  return csvResponse(`thaidatacorp-contracts-${label}.csv`, csv);
}
