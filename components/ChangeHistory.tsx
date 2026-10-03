import Link from "next/link";
import ChangeValue from "@/components/ChangeValue";
import { CHANGE_LABELS, type JuristicChange } from "@/lib/changes-repo";

/** ประวัติการเปลี่ยนแปลงบนหน้าบริษัท (แสดงเฉพาะเมื่อมีรายการ) */
export default function ChangeHistory({ changes }: { changes: JuristicChange[] }) {
  if (!changes.length) return null;
  return (
    <section id="changes" aria-labelledby="changes-h">
      <h2 id="changes-h" className="wiki-h2">
        ประวัติการเปลี่ยนแปลง
      </h2>
      <ul className="space-y-2 text-sm">
        {changes.map((c) => (
          <li key={c.id} className="border-l-2 border-wiki-border pl-3">
            <span className="text-wiki-muted">
              {new Date(c.detectedAt).toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" })}
            </span> ·{" "}
            <b>{CHANGE_LABELS[c.field]}</b>
            <div>
              <ChangeValue field={c.field} oldValue={c.oldValue} newValue={c.newValue} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-wiki-muted">
        วันที่คือวันที่ระบบตรวจพบการเปลี่ยนแปลงจากกรมพัฒนาธุรกิจการค้า ไม่ใช่วันที่จดทะเบียนแก้ไขจริง ·{" "}
        <Link href="/changes">ดูความเคลื่อนไหวนิติบุคคลทั้งหมด</Link>
      </p>
    </section>
  );
}
