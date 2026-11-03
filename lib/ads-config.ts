/**
 * การตั้งค่าโฆษณาสินค้า Shopee Affiliate — ไม่มี I/O (ใช้ได้ทั้ง server / client / สคริปต์)
 * ค่าจริงเก็บใน app_setting key "affiliate_config" (JSON) แก้ได้ที่ /admin/ads
 */

/** ตำแหน่งที่วางการ์ดสินค้า — count = จำนวนสินค้าที่แสดง */
export const AD_PLACEMENTS = {
  content_top: { label: "ใต้ย่อหน้าแรก (ในเนื้อหา)", count: 2 },
  content_bottom: { label: "ท้ายเนื้อหา", count: 4 },
  sidebar: { label: "ใต้กล่องข้อมูลด้านขวา (หน้าบริษัท)", count: 2 },
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
  guide: "คู่มือ / บทความ",
} as const;
export type AdPageType = keyof typeof AD_PAGE_TYPES;

/** หน้าที่ไม่แสดงโฆษณาเสมอ (เข้าสู่ระบบ/ชำระเงิน/ฟอร์ม/หลังบ้าน) — ผู้ดูแลเพิ่มรายการเองได้อีก */
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
  /** ไม่แสดงโฆษณาให้สมาชิกแพ็กเกจเสียเงิน */
  hideForPaid: boolean;
  placements: Record<AdPlacement, boolean>;
  pages: Record<AdPageType, boolean>;
  /** path ที่ไม่แสดงโฆษณาเพิ่มเติม (ขึ้นต้นด้วย) */
  extraExcluded: string[];
}

export const DEFAULT_ADS_CONFIG: AdsConfig = {
  enabled: false,
  hideForPaid: true,
  placements: { content_top: false, content_bottom: true, sidebar: true },
  pages: { home: false, company: true, list: true, changes: true, report: true, jobs: true, news: true, guide: true },
  extraExcluded: [],
};

/** อ่าน JSON จาก DB แบบปลอดภัย (ค่าเสีย/ไม่ครบ → ใช้ค่าเริ่มต้น) */
export function parseAdsConfig(raw: string | undefined | null): AdsConfig {
  let j: Partial<AdsConfig> = {};
  try {
    j = raw ? (JSON.parse(raw) as Partial<AdsConfig>) : {};
  } catch {
    j = {};
  }
  const d = DEFAULT_ADS_CONFIG;
  const placements = { ...d.placements };
  for (const k of Object.keys(placements) as AdPlacement[]) {
    if (typeof j.placements?.[k] === "boolean") placements[k] = j.placements[k] as boolean;
  }
  const pages = { ...d.pages };
  for (const k of Object.keys(pages) as AdPageType[]) if (typeof j.pages?.[k] === "boolean") pages[k] = j.pages[k] as boolean;
  return {
    enabled: Boolean(j.enabled),
    hideForPaid: j.hideForPaid ?? d.hideForPaid,
    placements,
    pages,
    extraExcluded: (Array.isArray(j.extraExcluded) ? j.extraExcluded : []).map(String).filter((p) => p.startsWith("/")).slice(0, 50),
  };
}

/** path นี้ห้ามมีโฆษณาหรือไม่ */
export function isExcludedPath(path: string, cfg: Pick<AdsConfig, "extraExcluded">): boolean {
  if (/^\/company\/\d{13}\/report/.test(path)) return true;
  return [...ALWAYS_EXCLUDED, ...cfg.extraExcluded].some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/** สินค้าที่ส่งให้ฝั่ง browser */
export interface AdProduct {
  id: number;
  name: string;
  price: string | null;
  shop: string | null;
  imageUrl: string | null;
}
