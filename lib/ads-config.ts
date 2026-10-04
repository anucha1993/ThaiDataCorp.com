/**
 * การตั้งค่าโฆษณา Google AdSense — ไม่มี I/O (ใช้ได้ทั้ง server / client / สคริปต์)
 * ค่าจริงเก็บใน app_setting key "ads_config" (JSON) แก้ได้ที่ /admin/ads
 */

/** ตำแหน่งโฆษณาแบบกำหนดเอง (ad unit) — วางในหน้าที่มีเนื้อหาเท่านั้น */
export const AD_PLACEMENTS = {
  content_top: { label: "ใต้ย่อหน้าแรก (ในเนื้อหา)", minHeight: 100 },
  content_bottom: { label: "ท้ายเนื้อหา", minHeight: 250 },
  sidebar: { label: "ใต้กล่องข้อมูลด้านขวา (หน้าบริษัท)", minHeight: 250 },
} as const;
export type AdPlacement = keyof typeof AD_PLACEMENTS;

/** ประเภทหน้าที่วางโฆษณาได้ (ปิดเป็นรายประเภทได้) */
export const AD_PAGE_TYPES = {
  home: "หน้าแรก",
  company: "หน้าบริษัท",
  list: "หน้ารายการ (บริษัทเปิดใหม่ / ประเภทธุรกิจ / งานภาครัฐ / หน่วยงาน)",
  changes: "ความเคลื่อนไหวนิติบุคคล",
  report: "ดัชนีธุรกิจรายเดือน",
  jobs: "ประกาศงาน",
  news: "ข่าวบริษัท",
} as const;
export type AdPageType = keyof typeof AD_PAGE_TYPES;

/**
 * หน้าที่ห้ามมีโฆษณาเสมอ (นโยบาย AdSense: หน้าเข้าสู่ระบบ/ชำระเงิน/ฟอร์ม/หลังบ้าน/หน้าที่ไม่มีเนื้อหา)
 * ผู้ดูแลเพิ่มรายการเองได้อีก แต่ลบรายการเหล่านี้ไม่ได้
 */
export const ALWAYS_EXCLUDED = [
  "/admin",
  "/account",
  "/business",
  "/login",
  "/register",
  "/auth",
  "/pay",
  "/pricing",
  "/contact",
  "/search",
  "/export",
  "/data-deletion",
];

export interface AdsConfig {
  enabled: boolean;
  /** ca-pub-XXXXXXXXXXXXXXXX */
  publisherId: string;
  /** โหลดสคริปต์ทั้งเว็บเพื่อให้ Auto ads ทำงาน (ตั้งค่า Auto ads ในเว็บ AdSense) */
  autoAds: boolean;
  /** ไม่แสดงโฆษณาให้สมาชิกแพ็กเกจเสียเงิน */
  hideForPaid: boolean;
  slots: Record<AdPlacement, string>;
  pages: Record<AdPageType, boolean>;
  /** path ที่ไม่แสดงโฆษณาเพิ่มเติม (ขึ้นต้นด้วย) */
  extraExcluded: string[];
  /** บรรทัดเพิ่มเติมใน ads.txt (เช่น เครือข่ายโฆษณาอื่น) */
  adsTxtExtra: string;
}

export const DEFAULT_ADS_CONFIG: AdsConfig = {
  enabled: false,
  publisherId: "",
  autoAds: true,
  hideForPaid: true,
  slots: { content_top: "", content_bottom: "", sidebar: "" },
  pages: { home: false, company: true, list: true, changes: true, report: true, jobs: true, news: true },
  extraExcluded: [],
  adsTxtExtra: "",
};

export const isPublisherId = (v: string) => /^ca-pub-\d{16}$/.test(v);
export const isSlotId = (v: string) => /^\d{6,12}$/.test(v);

/** อ่าน JSON จาก DB แบบปลอดภัย (ค่าเสีย/ไม่ครบ → ใช้ค่าเริ่มต้น) */
export function parseAdsConfig(raw: string | undefined | null): AdsConfig {
  let j: Partial<AdsConfig> = {};
  try {
    j = raw ? (JSON.parse(raw) as Partial<AdsConfig>) : {};
  } catch {
    j = {};
  }
  const d = DEFAULT_ADS_CONFIG;
  const slots = { ...d.slots };
  for (const k of Object.keys(slots) as AdPlacement[]) {
    const v = String(j.slots?.[k] ?? "");
    slots[k] = isSlotId(v) ? v : "";
  }
  const pages = { ...d.pages };
  for (const k of Object.keys(pages) as AdPageType[]) if (typeof j.pages?.[k] === "boolean") pages[k] = j.pages[k] as boolean;
  const publisherId = String(j.publisherId ?? "");
  return {
    enabled: Boolean(j.enabled) && isPublisherId(publisherId),
    publisherId: isPublisherId(publisherId) ? publisherId : "",
    autoAds: j.autoAds ?? d.autoAds,
    hideForPaid: j.hideForPaid ?? d.hideForPaid,
    slots,
    pages,
    extraExcluded: (Array.isArray(j.extraExcluded) ? j.extraExcluded : []).map(String).filter((p) => p.startsWith("/")).slice(0, 50),
    adsTxtExtra: String(j.adsTxtExtra ?? "").slice(0, 4000),
  };
}

/** path นี้ห้ามมีโฆษณาหรือไม่ */
export function isExcludedPath(path: string, cfg: Pick<AdsConfig, "extraExcluded">): boolean {
  return [...ALWAYS_EXCLUDED, ...cfg.extraExcluded].some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/** ค่าที่ส่งให้ฝั่ง browser (ไม่มีข้อมูลลับ) */
export interface PublicAdsConfig {
  publisherId: string;
  autoAds: boolean;
  hideForPaid: boolean;
  extraExcluded: string[];
}
