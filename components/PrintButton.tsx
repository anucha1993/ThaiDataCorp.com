"use client";

/** ปุ่มพิมพ์ / บันทึกเป็น PDF (ใช้หน้าต่างพิมพ์ของเบราว์เซอร์ → เลือก "Save as PDF") */
export default function PrintButton({ label = "🖨 พิมพ์ / บันทึกเป็น PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print cursor-pointer border border-wiki-link bg-wiki-link px-4 py-1.5 font-bold text-white hover:opacity-90"
    >
      {label}
    </button>
  );
}
