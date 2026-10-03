import type { ReactNode } from "react";
import Link from "next/link";
import { formatBaht, formatJuristicId, formatThaiDate, SITE_NAME, tsicUrl } from "@/lib/format";
import type { JuristicProfile, ProcurementSummary } from "@/types/company";
import StatusBadge from "@/components/StatusBadge";
import { VatInfoboxValue } from "@/components/VatSection";
import type { VatInfo } from "@/lib/vat-repo";

interface InfoboxRow {
  label: string;
  value: ReactNode;
}

/**
 * Infobox ด้านขวาแบบ Wikipedia — sticky เฉพาะจอ ≥ lg
 * ใช้ <table> จริงเพื่อให้ Google อ่านคู่ label/value ได้ชัดเจน
 */
/** linkTsic: เปิดลิงก์ไปหน้าประเภทธุรกิจ (มีเฉพาะเมื่อใช้ DB) */
export default function WikipediaInfobox({
  profile,
  linkTsic = false,
  procurement,
  vat,
}: {
  profile: JuristicProfile;
  linkTsic?: boolean;
  procurement?: ProcurementSummary | null;
  /** ทะเบียน VAT (มีเมื่อใช้ DB และ sync แล้ว) */
  vat?: VatInfo | null;
}) {
  const { address } = profile;

  const rows: InfoboxRow[] = [
    { label: "เลขทะเบียนนิติบุคคล", value: <span className="font-mono tabular-nums">{formatJuristicId(profile.id)}</span> },
    ...(profile.oldId ? [{ label: "เลขทะเบียนเดิม", value: profile.oldId }] : []),
    { label: "ประเภท", value: profile.type },
    { label: "สถานะ", value: <StatusBadge status={profile.status} text={profile.statusText} /> },
    {
      label: "วันจดทะเบียน",
      value: profile.registerDate ? <time dateTime={profile.registerDate}>{formatThaiDate(profile.registerDate)}</time> : "-",
    },
    ...(profile.dissolvedDate
      ? [{ label: "วันจดทะเบียนเลิก", value: <time dateTime={profile.dissolvedDate}>{formatThaiDate(profile.dissolvedDate)}</time> }]
      : []),
    { label: "ทุนจดทะเบียน", value: formatBaht(profile.registerCapital) },
    ...(profile.paidUpCapital != null ? [{ label: "ทุนชำระแล้ว", value: formatBaht(profile.paidUpCapital) }] : []),
    {
      label: "หมวดธุรกิจ (TSIC)",
      value: profile.tsic ? (
        <>
          <span className="font-mono">{profile.tsic.code}</span>
          <br />
          {linkTsic ? <Link href={tsicUrl(profile.tsic.code)}>{profile.tsic.description}</Link> : profile.tsic.description}
        </>
      ) : (
        "-"
      ),
    },
    // บริษัทที่เลิกแล้วและไม่พบใน VAT ไม่ต้องแสดง (ทะเบียน VAT มีเฉพาะผู้ที่ยังประกอบกิจการ)
    ...(vat?.loaded && (vat.registered || !profile.dissolvedDate)
      ? [{ label: "ภาษีมูลค่าเพิ่ม", value: <VatInfoboxValue vat={vat} /> }]
      : []),
    ...(procurement
      ? [
          {
            label: "งานภาครัฐ",
            value: (
              <a href="#procurement">
                {procurement.contracts.toLocaleString("th-TH")} สัญญา
                <br />
                {formatBaht(procurement.totalValue)}
              </a>
            ),
          },
        ]
      : []),
    { label: profile.branchName, value: address.full },
    {
      label: "จังหวัด",
      value:
        linkTsic && profile.tsic && address.province ? (
          <Link href={tsicUrl(profile.tsic.code, address.province)} title={`${profile.tsic.description} ใน${address.province}`}>
            {address.province}
          </Link>
        ) : (
          (address.province ?? "-")
        ),
    },
  ];

  return (
    <aside aria-labelledby="infobox-title" className="lg:sticky lg:top-4">
      <table className="w-full border-collapse border border-wiki-border bg-wiki-bg text-[0.85rem] leading-snug">
        <caption id="infobox-title" className="border border-b-0 border-wiki-border bg-wiki-header px-2 py-2 text-center font-bold">
          ข้อมูลนิติบุคคล - {SITE_NAME}
        </caption>
        <tbody>
          <tr>
            <td colSpan={2} className="px-3 pt-3 pb-2 text-center">
              <div className="font-serif text-base font-bold">{profile.nameTh}</div>
              {profile.nameEn && <div className="text-xs text-wiki-muted">{profile.nameEn}</div>}
            </td>
          </tr>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-wiki-border-light">
              <th scope="row" className="w-[42%] px-2 py-1.5 text-left align-top font-bold">
                {row.label}
              </th>
              <td className="px-2 py-1.5 align-top break-words">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}
