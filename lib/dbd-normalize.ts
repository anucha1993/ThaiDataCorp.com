/**
 * แปลงข้อมูลรูปแบบ DBD (key แบบ "cd:...") → JuristicProfile
 * ใช้กับทั้ง GDX และ DBD Open API (openapi.dbd.go.th) ซึ่งส่งโครงสร้างเดียวกัน
 * ไม่มี I/O และไม่ import "server-only" เพื่อให้สคริปต์ (tsx) ใช้ได้
 */
import { composeAddress, stripAdminPrefix } from "@/lib/address";
import type { Address, DbdRawAddress, DbdRawJuristicPerson, JuristicProfile, JuristicStatus } from "@/types/company";

const STATUS_MAP: Array<[RegExp, JuristicStatus]> = [
  [/ยังดำเนินกิจการ|คืนสู่ทะเบียน|ฟื้นฟู/, "active"],
  [/เสร็จการชำระบัญชี/, "liquidated"],
  [/ร้าง/, "abandoned"],
  [/เลิก|ล้มละลาย|ควบ/, "dissolved"],
];

/** ข้อความสถานะของ DBD → สถานะมาตรฐาน */
export function mapStatus(text: string): JuristicStatus {
  return STATUS_MAP.find(([re]) => re.test(text))?.[1] ?? "unknown";
}

/** "25530315" (พ.ศ.) หรือ "20100315" (ค.ศ.) → "2010-03-15" */
export function parseDbdDate(raw: string | null | undefined): string | null {
  const m = raw?.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  let year = Number(m[1]);
  if (year > 2400) year -= 543;
  const iso = `${year}-${m[2]}-${m[3]}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function parseAmount(raw: string | null | undefined): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function clean(value: string | null | undefined): string | undefined {
  const v = value?.trim().replace(/\s+/g, " ");
  return v && v !== "-" ? v : undefined;
}

function normalizeAddress(raw: DbdRawAddress | undefined): Address {
  const parts = {
    houseNo: clean(raw?.["cd:AddressNo"]),
    building: clean(raw?.["cd:Building"]),
    moo: clean(raw?.["cd:Moo"]),
    soi: clean(raw?.["cd:Soi"]),
    street: clean(raw?.["cd:Street"] ?? raw?.["cd:Road"]),
    subDistrict: stripAdminPrefix(clean(raw?.["cd:CitySubDivision"]?.["cr:CitySubDivisionTextTH"])),
    district: stripAdminPrefix(clean(raw?.["cd:City"]?.["cr:CityTextTH"])),
    province: stripAdminPrefix(clean(raw?.["cd:CountrySubDivision"]?.["cr:CountrySubDivisionTextTH"])),
    postCode: clean(raw?.["cd:PostCode"]),
  };

  // cd:Address = ที่อยู่ส่วนต้น (เลขที่ ซอย ถนน) ที่ DBD ประกอบไว้แล้ว — ใช้เป็นบรรทัดแรก
  // แล้วต่อด้วยอาคาร (ถ้ายังไม่อยู่ในบรรทัด) + แขวง/เขต/จังหวัด
  const line = clean(raw?.["cd:Address"]);
  if (!line) return composeAddress(parts);
  const head = [line, parts.building && !line.includes(parts.building) ? parts.building : undefined]
    .filter(Boolean)
    .join(" ");
  return composeAddress({ ...parts, line: head });
}

export function normalizeProfile(raw: DbdRawJuristicPerson): JuristicProfile {
  const objective = raw["cd:OrganizationJuristicObjective"]?.["td:JuristicObjective"];
  const statusText = raw["cd:OrganizationJuristicStatus"]?.trim() || "ไม่ทราบสถานะ";
  const tsicCode = clean(objective?.["td:JuristicObjectiveCode"]);

  return {
    id: raw["cd:OrganizationJuristicID"].trim(),
    oldId: clean(raw["cd:OrganizationOldJuristicID"]),
    nameTh: clean(raw["cd:OrganizationJuristicNameTH"]) ?? raw["cd:OrganizationJuristicID"],
    nameEn: clean(raw["cd:OrganizationJuristicNameEN"]),
    type: raw["cd:OrganizationJuristicType"]?.trim() || "นิติบุคคล",
    registerDate: parseDbdDate(raw["cd:OrganizationJuristicRegisterDate"]),
    status: mapStatus(statusText),
    statusText,
    registerCapital: parseAmount(raw["cd:OrganizationJuristicRegisterCapital"]) ?? 0,
    paidUpCapital: parseAmount(raw["cd:OrganizationJuristicPaidUpCapital"]),
    tsic: tsicCode ? { code: tsicCode, description: clean(objective?.["td:JuristicObjectiveTextTH"]) ?? "-" } : null,
    branchName: clean(raw["cd:OrganizationJuristicBranchName"]) ?? "สำนักงานใหญ่",
    address: normalizeAddress(raw["cd:OrganizationJuristicAddress"]?.["cr:AddressType"]),
  };
}
