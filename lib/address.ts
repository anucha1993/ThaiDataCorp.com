import type { Address } from "@/types/company";

type AddressParts = Omit<Address, "full"> & { line?: string };

/** ตัดคำนำหน้าออก เช่น "แขวงบางจาก" → "บางจาก", "จ.ปทุมธานี" → "ปทุมธานี" */
export function stripAdminPrefix(value: string | undefined): string | undefined {
  const v = value
    ?.trim()
    .replace(/^(แขวง|ตำบล|ต\.|เขต|อำเภอ|อ\.|จังหวัด|จ\.)\s*/, "")
    .trim();
  return v && v !== "-" ? v : undefined;
}

/**
 * ประกอบที่อยู่บรรทัดเดียว — กรุงเทพฯ ใช้ "แขวง/เขต" ต่างจังหวัดใช้ "ตำบล/อำเภอ/จังหวัด"
 * ถ้ามี line (ที่อยู่ส่วนต้นที่ประกอบมาแล้ว) จะใช้แทน houseNo/building/moo/soi/street
 */
export function composeAddress(parts: AddressParts): Address {
  const { line, ...a } = parts;
  const isBangkok = a.province?.includes("กรุงเทพ") ?? false;
  const withPrefix = (prefix: string, v?: string) => (v ? (v.startsWith(prefix) ? v : `${prefix}${v}`) : undefined);

  const head = line
    ? [line.replace(/\s+/g, " ").trim()]
    : [
        a.houseNo && `เลขที่ ${a.houseNo}`,
        a.building,
        a.moo && `หมู่ ${a.moo}`,
        withPrefix("ซอย", a.soi),
        withPrefix("ถนน", a.street),
      ];

  const full = [
    ...head,
    withPrefix(isBangkok ? "แขวง" : "ตำบล", a.subDistrict),
    withPrefix(isBangkok ? "เขต" : "อำเภอ", a.district),
    isBangkok ? a.province : withPrefix("จังหวัด", a.province),
    a.postCode,
  ]
    .filter(Boolean)
    .join(" ");

  return { ...a, full: full || "-" };
}
