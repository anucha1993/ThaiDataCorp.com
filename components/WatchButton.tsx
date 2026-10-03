import { watchTarget } from "@/app/actions";

/**
 * ปุ่ม "ติดตาม" — form POST ไปที่ Server Action (ไม่อ่าน cookie ตอน render เพื่อให้หน้ายังเป็น ISR ได้)
 * ถ้ายังไม่ได้ login ระบบจะพาไปหน้าเข้าสู่ระบบแล้วกลับมาหน้าเดิม
 */
export default function WatchButton({ kind, target, back, label }: { kind: "company" | "agency"; target: string; back: string; label?: string }) {
  return (
    <form action={watchTarget} className="inline-block">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        className="cursor-pointer border border-wiki-link bg-white px-3 py-1 text-sm font-bold text-wiki-link hover:bg-wiki-bg"
        title="รับแจ้งเตือนทางอีเมลเมื่อมีสัญญาจัดซื้อจัดจ้างภาครัฐใหม่"
      >
        ☆ {label ?? "ติดตาม"}
      </button>
    </form>
  );
}
