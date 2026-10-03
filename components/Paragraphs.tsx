/** ข้อความหลายบรรทัดจากผู้ใช้ → ย่อหน้า (แสดงเป็นข้อความล้วน ไม่ตีความ HTML) */
export default function Paragraphs({ text, className = "" }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  return (
    <div className={`space-y-2 ${className}`}>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
    </div>
  );
}
