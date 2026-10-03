import type { CompanySignal } from "@/types/company";

/** ข้อสังเกตจากข้อมูลสาธารณะ — แสดงเป็นข้อเท็จจริง พร้อมคำอธิบายว่าไม่ใช่การกล่าวหา */
export default function SignalsSection({ signals }: { signals: CompanySignal[] }) {
  return (
    <section id="signals" aria-labelledby="signals-h">
      <h2 id="signals-h" className="wiki-h2">
        ข้อสังเกตจากข้อมูลสาธารณะ
      </h2>
      <ul className="space-y-3">
        {signals.map((s) => (
          <li key={s.key} className="border-l-4 border-amber-400 bg-amber-50/60 px-3 py-2 text-sm">
            <b className="block">{s.title}</b>
            {s.detail}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-5 text-wiki-muted">
        ข้อสังเกตข้างต้นคำนวณอัตโนมัติจากข้อมูลทะเบียนนิติบุคคลและข้อมูลการจัดซื้อจัดจ้างภาครัฐที่เปิดเผยต่อสาธารณะ
        เพื่อช่วยในการตรวจสอบคู่ค้าเบื้องต้นเท่านั้น <b>ไม่ได้บ่งชี้หรือกล่าวหาว่ามีการกระทำผิดใด ๆ</b>{" "}
        ข้อมูลอาจไม่ครบถ้วนหรือมีความคลาดเคลื่อนจากแหล่งต้นทาง โปรดตรวจสอบกับหน่วยงานที่เกี่ยวข้องก่อนนำไปใช้ตัดสินใจ
        หากพบข้อมูลไม่ถูกต้อง แจ้งได้ที่ privacy@thaidatacorp.com
      </p>
    </section>
  );
}
