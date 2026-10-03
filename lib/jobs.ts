/**
 * ทะเบียนงานเบื้องหลัง — ใช้ร่วมกันระหว่างหน้า /admin/jobs และสคริปต์ jobs-tick / run-job
 * (ไม่ import "server-only" เพื่อให้สคริปต์ใช้ได้)
 */

export interface JobDef {
  key: string;
  label: string;
  description: string;
  /** สคริปต์ใน scripts/ */
  script: string;
  /** argument ที่ใส่เสมอ (ก่อน args จากหน้า admin) */
  baseArgs?: string[];
  /** ถือว่าค้าง (stale) ถ้าไม่มี heartbeat เกินกี่นาที */
  staleMinutes: number;
}

export const JOBS: JobDef[] = [
  {
    key: "sync-opend",
    label: "Sync นิติบุคคลตั้งใหม่/เลิก (DBD)",
    description: "ดึงชุดข้อมูลรายเดือนจาก data.go.th เฉพาะเดือนที่ใหม่หรือถูกแก้ไข",
    script: "sync-opend.ts",
    staleMinutes: 60,
  },
  {
    key: "sync-egp",
    label: "Sync สัญญาจัดซื้อจัดจ้าง (e-GP)",
    description: "ดึงสัญญาภาครัฐจาก data.go.th แล้วสร้างตารางสรุปใหม่",
    script: "sync-egp.ts",
    staleMinutes: 90,
  },
  {
    key: "egp-summary",
    label: "สร้างตารางสรุปงานภาครัฐ",
    description: "คำนวณอันดับบริษัท/หน่วยงาน/จังหวัดใหม่ (ไม่ดึงข้อมูล)",
    script: "sync-egp.ts",
    baseArgs: ["--summaries-only"],
    staleMinutes: 30,
  },
  {
    key: "backfill-dbd",
    label: "เติมข้อมูลบริษัทจาก DBD Open API",
    description: "ดึงข้อมูลทะเบียนของบริษัทผู้ชนะงานรัฐที่ยังไม่มีใน DB (ยิงช้า ๆ กัน WAF)",
    script: "backfill-dbd.ts",
    staleMinutes: 30,
  },
  {
    key: "alerts",
    label: "ส่งอีเมลแจ้งเตือนสมาชิก",
    description: "สัญญาภาครัฐใหม่ของรายการที่ติดตาม + บริษัทเปิดใหม่ตามเงื่อนไข",
    script: "send-alerts.ts",
    staleMinutes: 30,
  },
  {
    key: "backup-userdata",
    label: "สำรองข้อมูลผู้ใช้",
    description: "สำรองสมาชิก บัญชีบริษัท ประกาศงาน ข่าว คำร้อง และสถิติ ไว้ที่ storage/backups (เก็บ 14 วัน)",
    script: "backup-userdata.ts",
    staleMinutes: 60,
  },
  {
    key: "analytics-cleanup",
    label: "ล้างข้อมูลสถิติ / IP เก่า",
    description: "ลบ IP ที่เก็บเกิน 90 วัน และข้อมูลการเข้าชมเกิน 400 วัน (ตามนโยบายความเป็นส่วนตัว)",
    script: "analytics-cleanup.ts",
    staleMinutes: 30,
  },
];

export const jobByKey = (key: string) => JOBS.find((j) => j.key === key);

/** แยก args จากข้อความ เช่น "--limit=3000 --rate=1" — อนุญาตเฉพาะรูปแบบ --name หรือ --name=value */
export function parseArgs(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((a) => /^--[a-z][a-z0-9-]*(=[\w.,@:/-]+)?$/i.test(a));
}

export const CRON_PRESETS: Array<{ label: string; cron: string }> = [
  { label: "ทุก 15 นาที", cron: "*/15 * * * *" },
  { label: "ทุกชั่วโมง (นาทีที่ 15)", cron: "15 * * * *" },
  { label: "ทุกวัน 02:00", cron: "0 2 * * *" },
  { label: "ทุกวัน 07:00", cron: "0 7 * * *" },
  { label: "ทุกวันจันทร์ 03:00", cron: "0 3 * * 1" },
  { label: "วันที่ 1 ของเดือน 03:00", cron: "0 3 1 * *" },
];

export const JOB_TZ = "Asia/Bangkok";

/**
 * เวลารันครั้งถัดไปของ cron (เวลาไทย) เป็นข้อความ UTC "YYYY-MM-DD HH:MM:SS" สำหรับเก็บใน DB
 * (ส่ง Date ตรง ๆ ไม่ได้ เพราะ mysql2 จะแปลงเป็นเวลาท้องถิ่นของเครื่องที่รัน)
 */
export async function nextRunUtc(cron: string): Promise<string | null> {
  const { CronExpressionParser } = await import("cron-parser");
  try {
    return CronExpressionParser.parse(cron, { tz: JOB_TZ }).next().toDate().toISOString().slice(0, 19).replace("T", " ");
  } catch {
    return null;
  }
}

/** ตรวจรูปแบบ cron 5 ช่อง */
export async function isValidCron(cron: string): Promise<boolean> {
  return cron.trim().split(/\s+/).length === 5 && (await nextRunUtc(cron)) !== null;
}

/** แสดงเวลา UTC จาก DB เป็นเวลาไทย */
export function utcToThai(utc: string | null | undefined): string {
  if (!utc) return "-";
  const d = new Date(`${String(utc).replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime())
    ? String(utc)
    : d.toLocaleString("th-TH", { timeZone: JOB_TZ, dateStyle: "medium", timeStyle: "short" });
}
