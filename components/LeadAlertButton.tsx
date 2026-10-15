import { saveSearchQuery } from "@/app/actions";

/**
 * ปุ่ม "แจ้งเตือนเมื่อมีบริษัทเปิดใหม่ในธุรกิจนี้/จังหวัดนี้" — บันทึกเป็นการค้นหาที่บันทึก (Lead Finder)
 * ยังไม่ได้ login → พาไปเข้าสู่ระบบ/สมัครแล้วกลับมาบันทึกต่อ · form POST ไม่ต้องอ่าน cookie ตอน render (หน้ายังเป็น ISR ได้)
 */
export default function LeadAlertButton({ tsicCode, province, label }: { tsicCode: string; province?: string; label: string }) {
  const q = new URLSearchParams({ tsic: tsicCode, ...(province && { province }), status: "active" });
  return (
    <form action={saveSearchQuery} className="inline-block">
      <input type="hidden" name="query" value={q.toString()} />
      <button
        type="submit"
        className="cursor-pointer border border-wiki-link bg-white px-3 py-1 text-sm font-bold text-wiki-link hover:bg-wiki-bg"
        title="รับอีเมลรายชื่อบริษัทที่จดทะเบียนใหม่ตามเงื่อนไขนี้ (สมาชิกใช้ฟรี)"
      >
        🔔 {label}
      </button>
    </form>
  );
}
