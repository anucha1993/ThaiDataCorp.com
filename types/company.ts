/**
 * Type definitions สำหรับข้อมูลนิติบุคคล (DBD)
 *
 * แบ่งเป็น 2 ชั้น:
 *   1. Raw types   — โครงสร้าง JSON ตามที่ GDX/DBD ส่งกลับมา (key มี namespace เช่น "cd:...")
 *   2. Domain types — โครงสร้างที่ normalize แล้ว ใช้ใน UI ทั้งหมด
 *
 * UI ไม่ควรแตะ Raw types โดยตรง ให้ผ่าน normalizer ใน lib/api.ts เสมอ
 * เพื่อให้เปลี่ยนแหล่งข้อมูลได้โดยไม่กระทบ component
 */

/* -------------------------------------------------------------------------- */
/*                         Raw: GDX / DBD Juristic Profile                     */
/* -------------------------------------------------------------------------- */

export interface DbdRawAddress {
  "cd:Address"?: string;
  "cd:AddressNo"?: string;
  "cd:Building"?: string;
  "cd:RoomNo"?: string;
  "cd:Floor"?: string;
  "cd:Moo"?: string;
  "cd:Soi"?: string;
  "cd:Street"?: string;
  /** DBD Open API ใช้ cd:Road แทน cd:Street */
  "cd:Road"?: string;
  "cd:Yaek"?: string;
  "cd:Trok"?: string;
  "cd:Village"?: string;
  "cd:CitySubDivision"?: {
    "cr:CitySubDivisionCode"?: string;
    "cr:CitySubDivisionTextTH"?: string;
  };
  "cd:City"?: {
    "cr:CityCode"?: string;
    "cr:CityTextTH"?: string;
  };
  "cd:CountrySubDivision"?: {
    "cr:CountrySubDivisionCode"?: string;
    "cr:CountrySubDivisionTextTH"?: string;
  };
  "cd:PostCode"?: string;
}

export interface DbdRawObjective {
  "td:JuristicObjective"?: {
    "td:JuristicObjectiveCode"?: string;
    "td:JuristicObjectiveTextTH"?: string;
    "td:JuristicObjectiveTextEN"?: string;
  };
}

export interface DbdRawJuristicPerson {
  "cd:OrganizationJuristicID": string;
  "cd:OrganizationOldJuristicID"?: string;
  "cd:OrganizationJuristicNameTH": string;
  "cd:OrganizationJuristicNameEN"?: string;
  /** เช่น "บริษัทจำกัด", "บริษัทมหาชนจำกัด", "ห้างหุ้นส่วนจำกัด" */
  "cd:OrganizationJuristicType": string;
  /** รูปแบบ YYYYMMDD ปีพุทธศักราช เช่น "25560115" */
  "cd:OrganizationJuristicRegisterDate": string;
  /** เช่น "ยังดำเนินกิจการอยู่", "ร้าง", "เลิก", "เสร็จการชำระบัญชี" */
  "cd:OrganizationJuristicStatus": string;
  "cd:OrganizationJuristicObjective"?: DbdRawObjective;
  /** ทุนจดทะเบียน (บาท) เป็น string ตัวเลข */
  "cd:OrganizationJuristicRegisterCapital": string;
  "cd:OrganizationJuristicPaidUpCapital"?: string;
  "cd:OrganizationJuristicBranchName"?: string;
  "cd:OrganizationJuristicAddress"?: {
    "cr:AddressType"?: DbdRawAddress;
  };
}

export interface DbdRawProfileResponse {
  ResultList?: Array<{
    "cd:OrganizationJuristicPerson": DbdRawJuristicPerson;
  }>;
  /** GDX ส่ง Message มาเมื่อเกิดข้อผิดพลาด หรือไม่พบข้อมูล */
  Message?: string;
}

/** Response ของ DBD Open API: openapi.dbd.go.th/api/v1/juristic_person/{id} */
export interface DbdOpenApiResponse {
  /** "1000" = Success, "1004" = No data available */
  status?: { code?: string; description?: string };
  data?: Array<{ "cd:OrganizationJuristicPerson": DbdRawJuristicPerson }>;
}

/** Response ของ /ws/auth/validate */
export interface GdxAuthResponse {
  Result?: string;
  Message?: string;
}

/* -------------------------------------------------------------------------- */
/*              Raw: Open-D / data.go.th (CKAN datastore ของ DBD)             */
/* -------------------------------------------------------------------------- */

/**
 * 1 แถวในชุดข้อมูล "นิติบุคคลจดทะเบียนตั้งใหม่" (dataset_11_0121)
 * และ "นิติบุคคลจดทะเบียนเลิกกิจการ" (dataset_11_0219) — แยก resource เป็นรายเดือน
 */
export interface OpendJuristicRecord {
  _id: number;
  /** เลขทะเบียนเป็น numeric จึงไม่มีเลข 0 นำหน้า เช่น 105553000121 → ต้อง padStart(13, "0") */
  "เลขทะเบียน": number;
  /** ชื่อแบบย่อ เช่น "บจ.ตัวอย่าง จำกัด", "หจ.ตัวอย่าง", "บมจ.ตัวอย่าง จำกัด (มหาชน)" */
  "ชื่อนิติบุคคล": string;
  /**
   * ISO แต่ปีเป็น พ.ศ. เช่น "2569-07-25T00:00:00" (บางเดือนเป็นข้อความ "23/02/2567")
   * ชุดเลิกกิจการบางเดือนใช้คอลัมน์นี้เก็บ "วันที่จดทะเบียนเลิก"
   */
  "วันที่จดทะเบียน"?: string;
  /** มีเฉพาะชุดเลิกกิจการ (บางเดือน) */
  "วันที่จดทะเบียนเลิก"?: string;
  /** ส่วนใหญ่เป็น numeric แต่บางเดือนเป็นข้อความ เช่น "1,000,000.00" */
  "ทุนจดทะเบียน": number | string | null;
  /** รหัส TSIC 5 หลัก (numeric) */
  "รหัสวัตถุประสงค์": number | null;
  "วัตถุประสงค์": string | null;
  "ที่ตั้งสำนักงานใหญ่": string | null;
  /** เช่น "แขวงบางจาก" หรือ "ต.บางพูน" */
  "ตำบล": string | null;
  /** เช่น "เขตพระโขนง" หรือ "อ.เมืองปทุมธานี" */
  "อำเภอ": string | null;
  /** เช่น "กรุงเทพมหานคร" หรือ "จ.ปทุมธานี" */
  "จังหวัด": string | null;
  "รหัสไปรษณีย์": number | null;
}

export interface CkanResponse<T> {
  success: boolean;
  result?: T;
  error?: Record<string, unknown> & { message?: string; __type?: string };
}

export interface CkanResource {
  id: string;
  name: string;
  datastore_active?: boolean;
  last_modified?: string | null;
  metadata_modified?: string | null;
}

export interface CkanPackage {
  name: string;
  title: string;
  resources: CkanResource[];
}

export interface CkanDatastoreResult<R> {
  total?: number;
  records: R[];
}

/* -------------------------------------------------------------------------- */
/*                                Domain types                                */
/* -------------------------------------------------------------------------- */

export type JuristicStatus =
  | "active" // ยังดำเนินกิจการอยู่
  | "abandoned" // ร้าง
  | "dissolved" // เลิก
  | "liquidated" // เสร็จการชำระบัญชี
  | "unknown";

export interface Address {
  /** ที่อยู่เต็มบรรทัดเดียว สำหรับแสดงผล */
  full: string;
  houseNo?: string;
  building?: string;
  moo?: string;
  soi?: string;
  street?: string;
  subDistrict?: string;
  district?: string;
  province?: string;
  postCode?: string;
}

export interface TsicCode {
  code: string;
  description: string;
}

export interface JuristicProfile {
  /** เลขทะเบียนนิติบุคคล 13 หลัก */
  id: string;
  oldId?: string;
  nameTh: string;
  nameEn?: string;
  /** ประเภทนิติบุคคล เช่น "บริษัทจำกัด" */
  type: string;
  /** ISO date (ค.ศ.) เช่น "2013-01-15" */
  registerDate: string | null;
  /** ISO date (ค.ศ.) วันจดทะเบียนเลิก (ถ้ามี) */
  dissolvedDate?: string | null;
  status: JuristicStatus;
  /** ข้อความสถานะตามต้นฉบับ DBD */
  statusText: string;
  registerCapital: number;
  paidUpCapital?: number;
  tsic: TsicCode | null;
  /** วัตถุประสงค์ตามที่บริษัทจดทะเบียน (ข้อความของบริษัทเอง ต่างจากชื่อหมวด TSIC) */
  objective?: string;
  branchName: string;
  address: Address;
  /** ข้อมูลชุดนี้เป็นข้อมูล ณ เมื่อไร / จากแหล่งใด (มีเมื่ออ่านจาก DB หรือ DBD Open API) */
  dataAsOf?: DataAsOf;
}

/**
 * ที่มาและวันที่ของข้อมูลทะเบียน
 * - dbd: ตรวจกับ DBD Open API (ข้อมูลปัจจุบัน) เมื่อ `at`
 * - opend-new / opend-dissolved: ชุดข้อมูลรายเดือนของ DBD บน data.go.th (ข้อมูล ณ วันจดทะเบียน / วันเลิก) ประจำเดือน `period`
 */
export interface DataAsOf {
  kind: "dbd" | "opend-new" | "opend-dissolved";
  /** ISO timestamp: เวลาที่ตรวจกับ DBD หรือเวลาที่ sync ชุดข้อมูลรายเดือน */
  at: string;
  /** เดือนของชุดข้อมูล เช่น "กรกฎาคม 2565" (เฉพาะ opend-*) */
  period?: string;
}

export interface Director {
  order: number;
  name: string;
  /** ตำแหน่ง เช่น "กรรมการผู้จัดการ" (ถ้ามี) */
  position?: string;
}

export interface Shareholder {
  order: number;
  name: string;
  nationality?: string;
  shares: number;
  /** สัดส่วนการถือหุ้น 0–100 */
  percent: number;
}

export interface FinancialYear {
  /** ปีงบการเงิน ค.ศ. เช่น 2024 */
  fiscalYear: number;
  totalRevenue: number;
  netProfit: number;
  totalAssets: number;
  totalLiabilities?: number;
  equity?: number;
}

/** รูปแบบ JSON ที่คาดหวังจาก DIRECTORS_API_URL */
export interface DirectorsApiResponse {
  directors: Director[];
  shareholders: Shareholder[];
  /** ข้อความอำนาจกรรมการ เช่น "กรรมการสองคนลงลายมือชื่อร่วมกัน..." */
  authorizedSignatory?: string;
}

/** รูปแบบ JSON ที่คาดหวังจาก FINANCIALS_API_URL */
export interface FinancialsApiResponse {
  financials: FinancialYear[];
}

/** สัญญาจัดซื้อจัดจ้างภาครัฐ 1 รายการ (e-GP) */
export interface ProcurementContract {
  /** ปีงบประมาณ พ.ศ. */
  fiscalYear: number;
  projectName: string;
  projectType?: string;
  agency: string;
  method?: string;
  province?: string;
  /** ISO date */
  signDate: string | null;
  endDate: string | null;
  value: number;
  refPrice?: number;
  status?: string;
}

/** สรุปงานภาครัฐของบริษัท */
export interface ProcurementSummary {
  contracts: number;
  totalValue: number;
  agencies: number;
  firstSign: string | null;
  lastSign: string | null;
  fiscalYears: number[];
  topAgencies: Array<{ agency: string; contracts: number; value: number }>;
  /** สัญญาล่าสุด (สูงสุด 20 รายการ) */
  latest: ProcurementContract[];
}

/** ข้อสังเกตจากข้อมูลสาธารณะ (ข้อเท็จจริงเชิงตัวเลข ไม่ใช่คะแนนความเสี่ยง) */
export interface CompanySignal {
  key: string;
  title: string;
  detail: string;
}

/** นิติบุคคลอื่นที่จดทะเบียนที่อยู่เดียวกัน */
export interface SameAddressInfo {
  total: number;
  companies: Array<{ profile: JuristicProfile; govContracts: number }>;
}

export type DataSource = "gdx" | "opend" | "mock";

export interface CompanyData {
  profile: JuristicProfile;
  directors: Director[];
  shareholders: Shareholder[];
  authorizedSignatory?: string;
  /** เรียงจากปีล่าสุด → เก่าสุด */
  financials: FinancialYear[];
  /** งานจัดซื้อจัดจ้างภาครัฐ (มีเฉพาะเมื่อใช้ DB และบริษัทเคยได้งาน) */
  procurement?: ProcurementSummary | null;
  sameAddress?: SameAddressInfo | null;
  signals?: CompanySignal[];
  source: DataSource;
  /** ISO timestamp ที่ดึงข้อมูล */
  fetchedAt: string;
}
