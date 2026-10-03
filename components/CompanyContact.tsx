import Link from "next/link";
import type { ContactInfo } from "@/lib/support";
import { formatThaiDate } from "@/lib/format";

/**
 * ข้อมูลติดต่อที่เจ้าของกิจการแจ้ง (ผ่านการตรวจสอบแล้ว) + ลิงก์แจ้งแก้ไข/เพิ่มข้อมูลติดต่อ
 */
export default function CompanyContact({
  id,
  contact,
  verified = false,
}: {
  id: string;
  contact: (ContactInfo & { verifiedAt: string }) | null;
  verified?: boolean;
}) {
  const from = encodeURIComponent(`/company/${id}`);
  const rows = contact
    ? ([
        contact.phone && ["โทรศัพท์", <a key="p" href={`tel:${contact.phone.replace(/[^0-9+]/g, "")}`}>{contact.phone}</a>],
        contact.email && ["อีเมล", <a key="e" href={`mailto:${contact.email}`}>{contact.email}</a>],
        contact.website && ["เว็บไซต์", <a key="w" href={contact.website} target="_blank" rel="noopener nofollow">{contact.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>],
        contact.lineId && ["LINE", contact.lineId],
        contact.facebook && ["Facebook", <a key="f" href={contact.facebook} target="_blank" rel="noopener nofollow">{contact.facebook.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>],
      ].filter(Boolean) as Array<[string, React.ReactNode]>)
    : [];

  return (
    <section aria-label="ข้อมูลติดต่อ" className="mt-4 border border-wiki-border-light bg-wiki-bg p-3 text-sm">
      {rows.length > 0 ? (
        <>
          <h3 className="mb-1 font-bold">
            ข้อมูลติดต่อ {verified && <span className="text-xs font-normal text-green-800">✔ บริษัทยืนยันตัวตนแล้ว</span>}
          </h3>
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-wiki-muted">{k}</dt>
                <dd className="truncate">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 text-xs text-wiki-muted">ข้อมูลจากเจ้าของกิจการ ตรวจสอบเมื่อ {formatThaiDate(contact!.verifiedAt.slice(0, 10))}</p>
        </>
      ) : (
        <p className="text-wiki-muted">ยังไม่มีข้อมูลติดต่อที่ยืนยันโดยเจ้าของกิจการ</p>
      )}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {verified ? (
          <Link href={`/business/${id}`}>เจ้าของกิจการ: จัดการข้อมูลบริษัท</Link>
        ) : (
          <Link href={`/business/claim?id=${id}`}>เป็นเจ้าของกิจการ? ยืนยันบัญชีบริษัท (ฟรี)</Link>
        )}
        <Link href={`/contact?type=correction&id=${id}&from=${from}`}>แจ้งข้อมูลไม่ถูกต้อง</Link>
        <Link href={`/contact?type=removal&id=${id}&from=${from}`}>ขอลบข้อมูลส่วนบุคคล</Link>
      </p>
    </section>
  );
}
