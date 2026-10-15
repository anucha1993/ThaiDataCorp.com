import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerCheckList, partnerCheckItems } from "@/components/PartnerCheck";
import PrintButton from "@/components/PrintButton";
import ChangeValue from "@/components/ChangeValue";
import { getCompany, isValidJuristicId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isVerifiedCompany } from "@/lib/business";
import { CHANGE_LABELS, listCompanyChanges } from "@/lib/changes-repo";
import { formatBaht, formatJuristicId, formatNumber, formatThaiDate, SITE_NAME, SITE_URL } from "@/lib/format";
import { getVatInfo } from "@/lib/vat-repo";

export const metadata: Metadata = { title: "รายงานตรวจสอบคู่ค้า", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

/**
 * รายงานตรวจสอบคู่ค้า (สมาชิก — สมัครฟรี) จัดหน้าสำหรับพิมพ์/บันทึก PDF แนบเอกสารอนุมัติคู่ค้า
 * รวมเฉพาะข้อเท็จจริงจากแหล่งทางการ พร้อมวันที่ของข้อมูลและแหล่งอ้างอิง — ไม่ให้คะแนนความเสี่ยง
 */
export default async function PartnerReportPage({ params }: Props) {
  const { id } = await params;
  if (!isValidJuristicId(id)) notFound();
  const user = await requireUser(`/company/${id}/report`);
  const data = await getCompany(id);
  if (!data) notFound();
  const [vat, changes, verified] = await Promise.all([
    getVatInfo(id).catch(() => null),
    listCompanyChanges(id, 30).catch(() => []),
    isVerifiedCompany(id).catch(() => false),
  ]);
  const { profile, directors, procurement, sameAddress } = data;
  const items = partnerCheckItems({
    profile,
    vat,
    procurement,
    sameAddressTotal: sameAddress?.total ?? 0,
    latestChange: changes[0] ?? null,
    verified,
  });
  const now = new Date().toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Bangkok" });
  const asOf = profile.dataAsOf
    ? profile.dataAsOf.kind === "dbd"
      ? `ตรวจกับกรมพัฒนาธุรกิจการค้า (DBD Open API) เมื่อ ${new Date(profile.dataAsOf.at).toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" })}`
      : `ชุดข้อมูลรายเดือนของกรมพัฒนาธุรกิจการค้า${profile.dataAsOf.period ? ` เดือน${profile.dataAsOf.period}` : ""}`
    : null;
  const h2 = "mt-6 mb-2 border-b border-wiki-border pb-1 font-serif text-lg";
  const th = "w-44 py-1 pr-3 text-left align-top font-normal text-wiki-muted";

  return (
    <main className="mx-auto max-w-4xl px-4 py-4 print:max-w-none print:p-0">
      <div className="no-print mb-3 flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/company/${id}`}>← กลับหน้าบริษัท</Link>
        <PrintButton />
        <span className="text-xs text-wiki-muted">ในหน้าต่างพิมพ์ เลือกเครื่องพิมพ์ &ldquo;บันทึกเป็น PDF&rdquo; เพื่อเก็บเป็นไฟล์</span>
      </div>

      <article className="border border-wiki-border-light bg-white px-6 py-6 text-[0.95rem] leading-relaxed print:border-0 print:px-0">
        <header className="border-b-2 border-wiki-text pb-3">
          <div className="flex items-baseline justify-between gap-4">
            <div className="text-sm font-bold tracking-wide">{SITE_NAME}</div>
            <div className="text-xs text-wiki-muted">ออกรายงาน {now}</div>
          </div>
          <h1 className="mt-2 font-serif text-2xl">รายงานตรวจสอบคู่ค้า</h1>
          <div className="mt-1 text-lg font-bold">{profile.nameTh}</div>
          {profile.nameEn && <div className="text-sm text-wiki-muted">{profile.nameEn}</div>}
          <div className="mt-1 font-mono text-sm">เลขทะเบียนนิติบุคคล {formatJuristicId(profile.id)}</div>
        </header>

        <h2 className={h2}>สรุปข้อเท็จจริง</h2>
        <PartnerCheckList items={items} />

        <h2 className={h2}>ข้อมูลทะเบียน</h2>
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <th className={th}>ประเภท</th>
              <td>{profile.type}</td>
            </tr>
            <tr>
              <th className={th}>สถานะ</th>
              <td>{profile.statusText}</td>
            </tr>
            <tr>
              <th className={th}>วันจดทะเบียน</th>
              <td>{formatThaiDate(profile.registerDate)}</td>
            </tr>
            {profile.dissolvedDate && (
              <tr>
                <th className={th}>วันจดทะเบียนเลิก</th>
                <td>{formatThaiDate(profile.dissolvedDate)}</td>
              </tr>
            )}
            <tr>
              <th className={th}>ทุนจดทะเบียน</th>
              <td>{formatBaht(profile.registerCapital)}</td>
            </tr>
            <tr>
              <th className={th}>ประเภทธุรกิจ (TSIC)</th>
              <td>{profile.tsic ? `${profile.tsic.code} ${profile.tsic.description}` : "-"}</td>
            </tr>
            {profile.objective && (
              <tr>
                <th className={th}>วัตถุประสงค์</th>
                <td>{profile.objective}</td>
              </tr>
            )}
            <tr>
              <th className={th}>ที่ตั้งสำนักงานใหญ่</th>
              <td>{profile.address.full || "-"}</td>
            </tr>
            {asOf && (
              <tr>
                <th className={th}>ข้อมูล ณ</th>
                <td>{asOf}</td>
              </tr>
            )}
          </tbody>
        </table>

        {directors.length > 0 && (
          <>
            <h2 className={h2}>กรรมการ</h2>
            <ol className="list-decimal pl-6 text-sm">
              {directors.map((d) => (
                <li key={`${d.order}-${d.name}`}>
                  {d.name}
                  {d.position && <span className="text-wiki-muted"> — {d.position}</span>}
                </li>
              ))}
            </ol>
          </>
        )}

        {vat?.registered && (
          <>
            <h2 className={h2}>ภาษีมูลค่าเพิ่มและสาขา</h2>
            <p className="mb-1 text-sm">
              จดทะเบียน VAT{vat.since && ` ตั้งแต่ ${formatThaiDate(vat.since)}`} · สถานประกอบการ {formatNumber(vat.totalBranches)} แห่ง
              {vat.totalBranches > 20 && " (แสดง 20 แห่งแรก)"}
            </p>
            <table className="wikitable w-full text-xs">
              <tbody>
                {vat.branches.slice(0, 20).map((b) => (
                  <tr key={b.branchNo}>
                    <td className="whitespace-nowrap">{b.branchNo === 0 ? "สำนักงานใหญ่" : `สาขา ${String(b.branchNo).padStart(5, "0")}`}</td>
                    <td>{b.address ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 className={h2}>งานภาครัฐ (e-GP)</h2>
        {procurement ? (
          <>
            <p className="mb-1 text-sm">
              {formatNumber(procurement.contracts)} สัญญา มูลค่ารวม {formatBaht(procurement.totalValue)} จาก {formatNumber(procurement.agencies)} หน่วยงาน
              {procurement.firstSign && ` · ${formatThaiDate(procurement.firstSign)} – ${formatThaiDate(procurement.lastSign)}`}
            </p>
            {procurement.topAgencies.length > 0 && (
              <table className="wikitable w-full text-xs">
                <thead>
                  <tr>
                    <th>หน่วยงานหลัก</th>
                    <th>สัญญา</th>
                    <th>มูลค่า</th>
                  </tr>
                </thead>
                <tbody>
                  {procurement.topAgencies.slice(0, 5).map((a) => (
                    <tr key={a.agency}>
                      <td>{a.agency}</td>
                      <td className="text-right">{formatNumber(a.contracts)}</td>
                      <td className="text-right whitespace-nowrap">{formatBaht(a.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p className="text-sm text-wiki-muted">ไม่พบสัญญาในระบบจัดซื้อจัดจ้างภาครัฐที่ {SITE_NAME} มีข้อมูล</p>
        )}

        {changes.length > 0 && (
          <>
            <h2 className={h2}>ประวัติการเปลี่ยนแปลงที่ตรวจพบ</h2>
            <ul className="space-y-1 text-sm">
              {changes.map((c) => (
                <li key={c.id}>
                  <span className="text-wiki-muted">
                    {new Date(c.detectedAt).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" })}
                  </span>{" "}
                  · <b>{CHANGE_LABELS[c.field]}</b>: <ChangeValue field={c.field} oldValue={c.oldValue} newValue={c.newValue} />
                </li>
              ))}
            </ul>
          </>
        )}

        {sameAddress && sameAddress.total > 0 && (
          <>
            <h2 className={h2}>นิติบุคคลอื่นที่จดทะเบียนที่อยู่เดียวกัน</h2>
            <p className="mb-1 text-sm">{formatNumber(sameAddress.total)} ราย{sameAddress.total > 10 && " (แสดง 10 รายแรก)"}</p>
            <ul className="list-disc pl-6 text-xs">
              {sameAddress.companies.slice(0, 10).map(({ profile: p }) => (
                <li key={p.id}>
                  {p.nameTh} <span className="font-mono text-wiki-muted">{p.id}</span> — {p.statusText}
                </li>
              ))}
            </ul>
          </>
        )}

        <footer className="mt-8 border-t border-wiki-border pt-3 text-xs leading-5 text-wiki-muted">
          <p>
            แหล่งข้อมูล: กรมพัฒนาธุรกิจการค้า (data.go.th / DBD Open API), กรมสรรพากร (ทะเบียนภาษีมูลค่าเพิ่ม), ระบบการจัดซื้อจัดจ้างภาครัฐ (e-GP)
            — รวบรวมโดย {SITE_NAME} ({SITE_URL}/company/{profile.id})
          </p>
          <p className="mt-1">
            รายงานนี้แสดงข้อเท็จจริงจากข้อมูลสาธารณะ ณ วันที่ออกรายงาน ไม่ใช่การรับรองหรือประเมินความน่าเชื่อถือ ข้อมูลอาจไม่เป็นปัจจุบันหรือคลาดเคลื่อนจากต้นทาง
            หากต้องการใช้เป็นหลักฐานทางกฎหมาย โปรดขอหนังสือรับรองจากกรมพัฒนาธุรกิจการค้าโดยตรง · ออกให้ {user.email}
          </p>
        </footer>
      </article>
    </main>
  );
}
