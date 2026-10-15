import { watchTarget } from "@/app/actions";

/**
 * ปุ่ม "ติดตาม" — form POST ไปที่ Server Action (ไม่อ่าน cookie ตอน render เพื่อให้หน้ายังเป็น ISR ได้)
 * ถ้ายังไม่ได้ login ระบบจะพาไปหน้าเข้าสู่ระบบแล้วกลับมาหน้าเดิม
 */
export default function WatchButton({
  kind,
  target,
  back,
  label,
  variant = "button",
}: {
  kind: "company" | "agency";
  target: string;
  back: string;
  label?: string;
  /** link = ข้อความลิงก์เล็ก ๆ (ใช้ในบรรทัดข้อความ) */
  variant?: "button" | "link";
}) {
  return (
    <form action={watchTarget} className="inline-block">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        className={
          variant === "link"
            ? "cursor-pointer text-wiki-link hover:underline"
            : "cursor-pointer border border-wiki-link bg-white px-3 py-1 text-sm font-bold text-wiki-link hover:bg-wiki-bg"
        }
        title={kind === "company" ? "รับอีเมลเมื่อบริษัทเปลี่ยนชื่อ ทุน หรือสถานะ หรือได้สัญญาภาครัฐใหม่ (สมาชิกใช้ฟรี)" : "รับอีเมลเมื่อหน่วยงานนี้มีสัญญาจัดซื้อจัดจ้างใหม่ (สมาชิกใช้ฟรี)"}
      >
        {variant === "link" ? "" : "☆ "}
        {label ?? "ติดตาม"}
      </button>
    </form>
  );
}
