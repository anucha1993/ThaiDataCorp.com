/**
 * แพ็กเกจสมาชิก — ค่าจริงอยู่ในตาราง `plan` (แก้ได้ที่ /admin/plans)
 * DEFAULT_PLANS ใช้เป็นค่าสำรองเมื่ออ่าน DB ไม่ได้ และเป็นค่าเริ่มต้นตอนสร้างตาราง
 * (ไม่ import "server-only" เพื่อให้สคริปต์แจ้งเตือนใช้ได้)
 */
import type { RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";

/** รหัสแพ็กเกจ — "free" ต้องมีเสมอ */
export type PlanId = string;

export interface Plan {
  id: PlanId;
  name: string;
  /** บาท/เดือน (0 = ฟรี) */
  price: number;
  /** ทดลองใช้ฟรีกี่วัน (0 = ไม่มีช่วงทดลอง) */
  trialDays: number;
  maxWatches: number;
  maxSavedSearches: number;
  /** แจ้งเตือนทุกกี่วัน */
  alertEveryDays: number;
  /** จำนวนแถวสูงสุดต่อไฟล์ CSV (0 = ดาวน์โหลดไม่ได้) */
  exportRows: number;
  exportContracts: boolean;
  features: string[];
  /** แสดงในหน้าราคาและซื้อได้ */
  active: boolean;
  sort: number;
}

export const FREE_PLAN_ID = "free";

export const DEFAULT_PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free", name: "ฟรี", price: 0, trialDays: 0, maxWatches: 3, maxSavedSearches: 1, alertEveryDays: 7, exportRows: 0,
    exportContracts: false, active: true, sort: 0,
    features: ["ดูข้อมูลทุกหน้าบนเว็บ", "ติดตามบริษัท/หน่วยงานได้ 3 รายการ", "แจ้งเตือนทางอีเมลรายสัปดาห์"],
  },
};

const CACHE_MS = 60_000;
const g = globalThis as unknown as { __tdcPlans?: { at: number; plans: Record<PlanId, Plan> } };

function rowToPlan(r: RowDataPacket): Plan {
  return {
    id: r.id,
    name: r.name,
    price: Number(r.price),
    trialDays: Number(r.trial_days ?? 0),
    maxWatches: Number(r.max_watches),
    maxSavedSearches: Number(r.max_saved_searches),
    alertEveryDays: Math.max(1, Number(r.alert_every_days)),
    exportRows: Number(r.export_rows),
    exportContracts: Number(r.export_contracts) === 1,
    features: String(r.features ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    active: Number(r.active) === 1,
    sort: Number(r.sort),
  };
}

/** แพ็กเกจทั้งหมด (รวมที่ปิดขาย — สมาชิกเดิมยังใช้สิทธิ์ได้) */
export async function getPlans(): Promise<Record<PlanId, Plan>> {
  if (g.__tdcPlans && Date.now() - g.__tdcPlans.at < CACHE_MS) return g.__tdcPlans.plans;
  try {
    const rows = await dbQuery<RowDataPacket[]>(`SELECT * FROM plan ORDER BY sort, price`);
    const plans: Record<PlanId, Plan> = Object.fromEntries(rows.map((r) => [r.id as string, rowToPlan(r)]));
    if (!plans[FREE_PLAN_ID]) plans[FREE_PLAN_ID] = DEFAULT_PLANS.free;
    g.__tdcPlans = { at: Date.now(), plans };
    return plans;
  } catch (e) {
    console.error("[plans] load failed, using defaults:", e);
    return DEFAULT_PLANS;
  }
}

export async function getPlan(id: string | null | undefined): Promise<Plan> {
  const plans = await getPlans();
  return plans[id ?? FREE_PLAN_ID] ?? plans[FREE_PLAN_ID];
}

/** แพ็กเกจที่แสดงในหน้าราคา (เรียงตาม sort) */
export async function listPublicPlans(): Promise<Plan[]> {
  return Object.values(await getPlans()).filter((p) => p.active).sort((a, b) => a.sort - b.sort || a.price - b.price);
}

/** ล้าง cache หลังแก้แพ็กเกจในหน้า admin */
export function invalidatePlans(): void {
  g.__tdcPlans = undefined;
}

export function isValidPlanSlug(id: string): boolean {
  return /^[a-z][a-z0-9-]{1,15}$/.test(id);
}
