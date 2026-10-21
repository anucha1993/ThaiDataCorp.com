import Link from "next/link";
import { type AiArticleBody, RISKY_TEXT } from "@/lib/ai-articles";

/** แสดงเนื้อหาบทความอัตโนมัติจาก JSON (ข้อความล้วน — React escape ให้ ไม่มี HTML จาก AI)
 *  markRisky: หน้าอ่านทวนของแอดมิน — ไฮไลต์ข้อความที่มีตัวเลขให้ตรวจข้อเท็จจริง (บทความสถิติตรวจตัวเลขอัตโนมัติแล้ว ไม่ต้องไฮไลต์) */
export default function AiArticleView({ body, markRisky = false }: { body: AiArticleBody; markRisky?: boolean }) {
  const cls = (t: string) => (markRisky && !body.facts && RISKY_TEXT.test(t) ? "bg-yellow-100 outline outline-1 outline-yellow-400" : undefined);
  return (
    <>
      {body.facts && body.facts.length > 0 && (
        // ตารางนี้มาจากฐานข้อมูลโดยตรง ไม่ผ่าน AI
        <table className="wikitable mb-4 w-full text-sm">
          <caption className="mb-1 text-left font-bold">ข้อมูลสำคัญ</caption>
          <tbody>
            {body.facts.map((f) => (
              <tr key={f.label}>
                <th className="w-2/5 text-left font-normal text-wiki-muted">{f.label}</th>
                <td>{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {body.sections.map((s, i) => (
        <section key={i}>
          <h2>{s.heading}</h2>
          {s.paragraphs.map((p, j) => (
            <p key={j} className={cls(p)}>
              {p}
            </p>
          ))}
          {s.bullets && s.bullets.length > 0 && (
            <ul>
              {s.bullets.map((b, j) => (
                <li key={j} className={cls(b)}>
                  {b}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {body.links && body.links.length > 0 ? (
        <>
          <h2>ดูข้อมูลเพิ่มเติม</h2>
          <ul>
            {body.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h2>ใช้เครื่องมือของ ThaiDataCorp</h2>
          <p>
            ตรวจข้อมูลบริษัทด้วยเลขทะเบียน 13 หลักได้ที่<Link href="/search">ค้นหานิติบุคคล</Link> ดูขั้นตอนตรวจสอบครบชุดได้ที่
            <Link href="/guide/partner-check">ตรวจสอบคู่ค้าก่อนทำสัญญา</Link> และติดตามการเปลี่ยนแปลงล่าสุดที่<Link href="/changes">ความเคลื่อนไหวนิติบุคคล</Link>
          </p>
        </>
      )}
      {body.source && <p className="text-xs text-wiki-muted">{body.source}</p>}
    </>
  );
}
