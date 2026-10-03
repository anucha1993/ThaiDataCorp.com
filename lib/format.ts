import type { CompanyData, JuristicStatus } from "@/types/company";

export const SITE_NAME = "ThaiDataCorp";
export const SITE_TAGLINE = "คลังข้อมูลนิติบุคคลและธุรกิจไทย";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://thaidatacorp.com").replace(/\/+$/, "");

const bahtFormatter = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const thaiDateFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

/** 5000000 → "5,000,000" */
export function formatNumber(n: number): string {
  return bahtFormatter.format(n);
}

/** 5000000 → "5,000,000 บาท" */
export function formatBaht(n: number): string {
  return `${bahtFormatter.format(n)} บาท`;
}

/** "2010-03-15" → "15 มีนาคม 2553" */
export function formatThaiDate(iso: string | null): string {
  if (!iso) return "-";
  return thaiDateFormatter.format(new Date(`${iso}T00:00:00+07:00`));
}

/** "0105553000121" → "0-1055-53000-12-1" (รูปแบบที่ DBD ใช้แสดงผล) */
export function formatJuristicId(id: string): string {
  return id.length === 13 ? `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}` : id;
}

/**
 * ลิงก์หน้าบริษัทบน DBD DataWarehouse+ (กรรมการ ผู้ถือหุ้น งบการเงิน ฉบับทางการ)
 * รูปแบบ: /company/profile/{หลักที่ 4 ของเลขทะเบียน = ประเภทนิติบุคคล}{เลขทะเบียน}
 * เช่น 0105559140065 → /company/profile/50105559140065
 */
export function dbdWarehouseUrl(id: string): string {
  return `https://datawarehouse.dbd.go.th/company/profile/${id[3]}${id}`;
}

/** URL หน้าประเภทธุรกิจ: /tsic/70209 หรือ /tsic/70209/กรุงเทพมหานคร */
export function tsicUrl(code: string, province?: string): string {
  return `/tsic/${code}${province ? `/${encodeURIComponent(province)}` : ""}`;
}

/** "กรุงเทพมหานคร" → "ในกรุงเทพมหานคร", "ระยอง" → "ในจังหวัดระยอง" */
export function inProvince(province: string): string {
  return province.includes("กรุงเทพ") ? `ใน${province}` : `ในจังหวัด${province}`;
}

/** URL หน้าหน่วยงานรัฐ: /agency/กรมทางหลวง */
export function agencyUrl(agency: string): string {
  return `/agency/${encodeURIComponent(agency)}`;
}

/** URL หน้าจัดอันดับผู้รับงานภาครัฐ: /procurement หรือ /procurement/ระยอง */
export function procurementUrl(province?: string): string {
  return province ? `/procurement/${encodeURIComponent(province)}` : "/procurement";
}

/** จำนวนเงินแบบย่อ: 1,564,201,209 → "1,564.2 ล้านบาท" */
export function formatMillionBaht(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ล้านบาท` : `${formatNumber(n)} บาท`;
}

/** ปี ค.ศ. → พ.ศ. */
export function toBuddhistYear(year: number): number {
  return year + 543;
}

export const STATUS_LABEL: Record<JuristicStatus, string> = {
  active: "ยังดำเนินกิจการอยู่",
  abandoned: "ร้าง",
  dissolved: "เลิก",
  liquidated: "เสร็จการชำระบัญชี",
  unknown: "ไม่ทราบสถานะ",
};

/** ชื่อเต็มสำหรับ H1 / Title: "ชื่อไทย (ENGLISH NAME)" */
export function displayName(nameTh: string, nameEn?: string): string {
  return nameEn ? `${nameTh} (${nameEn})` : nameTh;
}

/**
 * ข้อความวัตถุประสงค์จาก Open-D มักขึ้นต้นด้วย "ประกอบกิจการ..." อยู่แล้ว
 * ส่วน GDX/TSIC เป็นชื่อหมวด เช่น "ภัตตาคารและร้านอาหาร"
 */
function describeBusiness(description: string): string {
  return description.startsWith("ประกอบ") ? `โดย${description}` : `ประกอบธุรกิจหมวด${description}`;
}

/**
 * บทความสรุปอัตโนมัติ (Section 1) — ใช้ทั้งในหน้าเพจและ meta description
 * สร้างเป็นประโยคธรรมชาติจากข้อมูลจริง เพื่อให้แต่ละหน้ามีเนื้อหาเฉพาะตัว (unique content สำหรับ pSEO)
 */
export function buildIntroText(data: CompanyData): string {
  const { profile: p, directors, financials } = data;
  const parts: string[] = [];

  parts.push(
    `${p.nameTh}${p.nameEn ? ` (${p.nameEn})` : ""} (ThaiDataCorp ID: ${p.id}) เป็นนิติบุคคลประเภท${p.type}` +
      (p.tsic ? ` ${describeBusiness(p.tsic.description)} (รหัส TSIC ${p.tsic.code})` : "") +
      (p.registerDate ? ` จัดตั้งเมื่อวันที่ ${formatThaiDate(p.registerDate)}` : "") +
      ` ด้วยทุนจดทะเบียน ${formatNumber(p.registerCapital)} บาท`,
  );

  if (p.address.province) {
    parts.push(`มีสำนักงานใหญ่ตั้งอยู่ที่จังหวัด${p.address.province.replace(/^จังหวัด/, "")}`);
  }

  parts.push(
    p.dissolvedDate
      ? `และได้จดทะเบียนเลิกกิจการเมื่อวันที่ ${formatThaiDate(p.dissolvedDate)}`
      : `ปัจจุบันมีสถานะ "${p.statusText}"`,
  );

  if (directors.length > 0) {
    parts.push(`มีกรรมการ${p.type.includes("ห้างหุ้นส่วน") ? "/หุ้นส่วนผู้จัดการ" : ""}จำนวน ${directors.length} คน`);
  }

  if (data.procurement) {
    const pr = data.procurement;
    parts.push(
      `ได้รับสัญญาจัดซื้อจัดจ้างจากหน่วยงานภาครัฐ ${formatNumber(pr.contracts)} สัญญา มูลค่ารวม ${formatNumber(pr.totalValue)} บาท`,
    );
  }

  const latest = financials[0];
  if (latest) {
    const result = latest.netProfit >= 0 ? `กำไรสุทธิ ${formatNumber(latest.netProfit)}` : `ขาดทุนสุทธิ ${formatNumber(Math.abs(latest.netProfit))}`;
    parts.push(
      `ในปีงบการเงิน ${toBuddhistYear(latest.fiscalYear)} มีรายได้รวม ${formatNumber(latest.totalRevenue)} บาท และ${result} บาท`,
    );
  }

  return parts.join(" ");
}
