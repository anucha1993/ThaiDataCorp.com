/**
 * โหมดการเก็บเงิน — ตั้งได้ที่ /admin/settings
 *
 * - ปิดการเก็บเงิน (ค่าเริ่มต้น ช่วงเปิดตัว): สมาชิกทุกคนได้สิทธิ์ตามแพ็กเกจ "free_mode_plan" ฟรี
 *   หน้าราคา/ชำระเงิน/ทดลองใช้ถูกซ่อน — แค่สมัครสมาชิกก็ใช้งานได้เต็ม
 * - เปิดการเก็บเงิน: ใช้แพ็กเกจ/ราคา/ช่วงทดลองตามที่ตั้งไว้ใน /admin/plans
 *
 * (ไม่ import "server-only" เพื่อให้สคริปต์แจ้งเตือนใช้ได้)
 */
import { FREE_PLAN_ID, type Plan, type PlanId } from "@/lib/plans";
import { getSetting } from "@/lib/settings";

export async function isBillingEnabled(): Promise<boolean> {
  return (await getSetting("billing_enabled")) === "1";
}

/** แพ็กเกจที่สมาชิกทุกคนได้ระหว่างปิดการเก็บเงิน */
export async function freeModePlanId(): Promise<PlanId> {
  return (await getSetting("free_mode_plan")) || "business";
}

/**
 * แพ็กเกจที่ใช้ได้จริงของสมาชิก 1 คน
 * @param purchased แพ็กเกจที่บันทึกไว้ในบัญชี
 * @param active    แพ็กเกจนั้นยังไม่หมดอายุ
 */
export async function effectivePlan(plans: Record<PlanId, Plan>, purchased: PlanId, active: boolean): Promise<Plan> {
  if (!(await isBillingEnabled())) {
    return plans[await freeModePlanId()] ?? plans.business ?? plans[FREE_PLAN_ID];
  }
  return plans[purchased !== FREE_PLAN_ID && active ? purchased : FREE_PLAN_ID] ?? plans[FREE_PLAN_ID];
}

/** ข้อความกำกับปุ่มดาวน์โหลด/เครื่องมือ ตามโหมด */
export async function memberToolNote(kind: "new" | "contracts"): Promise<string> {
  if (!(await isBillingEnabled())) return "(สำหรับสมาชิก — สมัครฟรี)";
  return kind === "contracts" ? "(แพ็กเกจ Business)" : "(สมาชิก Pro ขึ้นไป)";
}
