import Link from "next/link";
import Panel, { primaryButtonCls } from "@/components/Panel";
import { formatNumber, SITE_NAME } from "@/lib/format";
import type { Plan } from "@/lib/plans";

/** หน้า /pricing ระหว่างปิดการเก็บเงิน — ชวนสมัครสมาชิกฟรี โดยแสดงสิทธิ์ตามแพ็กเกจที่ตั้งไว้ */
export default function FreeModePricing({ plan }: { plan: Plan }) {
  const benefits = [
    "ดูรายชื่อบริษัทเปิดใหม่ได้ทุกหน้า และกรองตามประเภทธุรกิจ",
    `ติดตามบริษัทและหน่วยงานรัฐได้ ${formatNumber(plan.maxWatches)} รายการ`,
    `รับอีเมลแจ้งเตือนเมื่อมีสัญญาภาครัฐใหม่${plan.alertEveryDays === 1 ? "ทุกวัน" : `ทุก ${plan.alertEveryDays} วัน`}`,
    `ตั้งเงื่อนไขแจ้งเตือนบริษัทเปิดใหม่ (ประเภทธุรกิจ × จังหวัด) ได้ ${formatNumber(plan.maxSavedSearches)} เงื่อนไข`,
    ...(plan.exportRows > 0 ? [`ดาวน์โหลดรายชื่อบริษัทเปิดใหม่เป็น CSV สูงสุด ${formatNumber(plan.exportRows)} แถว/ไฟล์`] : []),
    ...(plan.exportContracts ? ["ดาวน์โหลดสัญญาจัดซื้อจัดจ้างภาครัฐเป็น CSV ตามบริษัทหรือหน่วยงาน"] : []),
  ];
  return (
    <Panel title="สมัครสมาชิกฟรี" crumbs={[{ label: "สมัครสมาชิก" }]}>
      <p className="mb-4 leading-7">
        ข้อมูลทุกหน้าบน {SITE_NAME} ดูได้ฟรีโดยไม่ต้องสมัคร สมัครสมาชิก (ฟรี ไม่มีค่าใช้จ่าย) เพื่อใช้เครื่องมือเพิ่มเติม:
      </p>
      <ul className="mb-6 list-disc space-y-1 pl-6">
        {benefits.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <Link href="/login?next=/account" className={primaryButtonCls}>
        สมัครสมาชิกฟรีด้วยอีเมล
      </Link>
      <p className="mt-4 text-xs text-wiki-muted">
        ไม่ต้องตั้งรหัสผ่าน — ระบบส่งลิงก์เข้าสู่ระบบไปที่อีเมลของคุณ · ดู <Link href="/terms">เงื่อนไขการใช้งาน</Link>
      </p>
    </Panel>
  );
}
