import Link from "next/link";
import { notFound } from "next/navigation";
import { adminPublishContact, adminRemoveContact, adminUpdateRequest } from "@/app/admin/actions";
import AdminCard from "@/components/AdminCard";
import { Notice, buttonCls, inputCls, primaryButtonCls } from "@/components/Panel";
import { isMailConfigured } from "@/lib/mailer";
import { getJuristicContact, getRequest, RELATIONS, REQUEST_STATUS, REQUEST_TYPES } from "@/lib/support";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MSG: Record<string, { tone: "ok" | "error"; text: string }> = {
  "ok:updated": { tone: "ok", text: "บันทึกสถานะแล้ว" },
  "ok:published": { tone: "ok", text: "เผยแพร่ข้อมูลติดต่อบนหน้าบริษัทแล้ว และปิดคำร้อง" },
  "ok:removed": { tone: "ok", text: "ลบข้อมูลติดต่อออกจากหน้าบริษัทแล้ว" },
  "error:status": { tone: "error", text: "สถานะไม่ถูกต้อง" },
  "error:nocompany": { tone: "error", text: "คำร้องนี้ไม่ได้ระบุนิติบุคคล" },
  "error:contact-empty": { tone: "error", text: "กรอกข้อมูลติดต่ออย่างน้อย 1 ช่อง" },
  "error:contact-phone": { tone: "error", text: "เบอร์โทรไม่ถูกต้อง" },
  "error:contact-email": { tone: "error", text: "อีเมลไม่ถูกต้อง" },
  "error:contact-website": { tone: "error", text: "เว็บไซต์ไม่ถูกต้อง" },
  "error:contact-facebook": { tone: "error", text: "ลิงก์ Facebook ไม่ถูกต้อง" },
  "error:contact-line": { tone: "error", text: "LINE ID ไม่ถูกต้อง" },
};

export default async function RequestDetailPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  const r = Number.isInteger(id) && id > 0 ? await getRequest(id) : null;
  if (!r) notFound();
  const q = await searchParams;
  const msg = one(q.ok) ? MSG[`ok:${one(q.ok)}`] : one(q.error) ? MSG[`error:${one(q.error)}`] : undefined;
  const current = r.juristicId ? await getJuristicContact(r.juristicId) : null;
  const mail = isMailConfigured();
  const proposed = r.contact ?? {};

  return (
    <>
      <AdminCard title={`คำร้อง ${r.ticket}`} actions={<Link href="/admin/requests">← คำร้องทั้งหมด</Link>}>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <table className="wikitable mb-4">
          <tbody>
            {(
              [
                ["ประเภท", REQUEST_TYPES[r.type]?.label ?? r.type],
                ["สถานะ", REQUEST_STATUS[r.status]?.label ?? r.status],
                ["นิติบุคคล", r.juristicId ? <Link href={`/company/${r.juristicId}`}>{r.companyName ?? r.juristicId} ({r.juristicId})</Link> : "-"],
                ["หน้าที่แจ้ง", r.pageUrl ? <Link href={r.pageUrl}>{r.pageUrl}</Link> : "-"],
                ["ผู้แจ้ง", `${r.name}${r.relation ? ` — ${RELATIONS[r.relation as keyof typeof RELATIONS] ?? r.relation}` : ""}`],
                ["อีเมล", <a key="m" href={`mailto:${r.email}?subject=${encodeURIComponent(`[${r.ticket}] ${REQUEST_TYPES[r.type]?.label ?? ""}`)}`}>{r.email}</a>],
                ["โทร", r.phone ?? "-"],
                ["หัวข้อ", r.subject ?? "-"],
                ["ส่งเมื่อ", r.createdAt.slice(0, 16)],
                ["ปิดเรื่องเมื่อ", r.resolvedAt?.slice(0, 16) ?? "-"],
              ] as Array<[string, React.ReactNode]>
            ).map(([k, v]) => (
              <tr key={k}>
                <th scope="row" className="w-36 text-left!">
                  {k}
                </th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="mb-1 font-bold">รายละเอียด</h3>
        <p className="mb-4 border border-wiki-border-light bg-wiki-bg p-3 text-sm whitespace-pre-wrap">{r.message}</p>

        <form action={adminUpdateRequest} className="grid max-w-3xl gap-3 border border-wiki-border-light p-3 text-sm">
          <input type="hidden" name="id" value={r.id} />
          <label className="flex flex-col gap-1">
            สถานะ
            <select name="status" defaultValue={r.status === "new" ? "in_progress" : r.status} className={inputCls}>
              {Object.entries(REQUEST_STATUS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            บันทึกภายใน (ผู้แจ้งไม่เห็น)
            <textarea name="note" rows={3} defaultValue={r.adminNote ?? ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            ข้อความถึงผู้แจ้ง (ส่งทางอีเมลพร้อมสถานะ)
            <textarea name="reply" rows={3} className={inputCls} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="notify" value="1" defaultChecked={mail} disabled={!mail} />
            ส่งอีเมลแจ้งผู้แจ้ง {!mail && <span className="text-wiki-muted">(ยังไม่ได้ตั้ง SMTP — ตอบกลับด้วยลิงก์อีเมลด้านบนแทน)</span>}
          </label>
          <div>
            <button type="submit" className={primaryButtonCls}>
              บันทึก
            </button>
          </div>
        </form>
      </AdminCard>

      {r.type === "contact" && r.juristicId && (
        <AdminCard title="ข้อมูลติดต่อของกิจการ">
          <p className="mb-3 text-sm text-wiki-muted">
            ตรวจสอบว่าผู้แจ้งเป็นตัวแทนของกิจการจริงก่อนเผยแพร่ เช่น โทรกลับเบอร์ที่ให้มา หรืออีเมลจากโดเมนของบริษัท — แก้ค่าได้ก่อนกดเผยแพร่
          </p>
          <form action={adminPublishContact} className="grid max-w-3xl gap-3 text-sm sm:grid-cols-2">
            <input type="hidden" name="id" value={r.id} />
            {(
              [
                ["phone", "เบอร์โทรศัพท์", proposed.phone],
                ["email", "อีเมล", proposed.email],
                ["website", "เว็บไซต์", proposed.website],
                ["lineId", "LINE ID", proposed.lineId],
                ["facebook", "Facebook", proposed.facebook],
              ] as const
            ).map(([k, label, val]) => (
              <label key={k} className="flex flex-col gap-1">
                {label}
                <input name={k} defaultValue={val ?? ""} className={inputCls} />
              </label>
            ))}
            <div className="flex items-end">
              <button type="submit" className={primaryButtonCls}>
                ✓ ตรวจสอบแล้ว — เผยแพร่บนหน้าบริษัท
              </button>
            </div>
          </form>
          {current && (
            <form action={adminRemoveContact} className="mt-4 border-t border-wiki-border-light pt-3 text-sm">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="juristicId" value={r.juristicId} />
              ข้อมูลที่แสดงอยู่ตอนนี้ (ยืนยัน {current.verifiedAt.slice(0, 10)}):{" "}
              {[current.phone, current.email, current.website, current.lineId, current.facebook].filter(Boolean).join(" · ")}{" "}
              <button type="submit" className={`${buttonCls} ml-2 text-red-800`}>
                ลบออกจากหน้าบริษัท
              </button>
            </form>
          )}
        </AdminCard>
      )}
    </>
  );
}
