import Link from "next/link";
import WatchButton from "@/components/WatchButton";
import { CHANGE_LABELS, type JuristicChange } from "@/lib/changes-repo";
import { formatBaht, formatNumber, formatThaiDate } from "@/lib/format";
import type { VatInfo } from "@/lib/vat-repo";
import type { TisiInfo } from "@/lib/tisi-repo";
import type { JuristicProfile, ProcurementSummary } from "@/types/company";

/** อายุบริษัทจากวันจดทะเบียน เช่น "3 ปี 2 เดือน" */
export function companyAge(registerDate: string | null, now = new Date()): { text: string; months: number } | null {
  if (!registerDate) return null;
  const d = new Date(`${registerDate}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return null;
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months--;
  months = Math.max(0, months);
  const y = Math.floor(months / 12);
  const m = months % 12;
  const text = y > 0 ? `${y} ปี${m ? ` ${m} เดือน` : ""}` : m > 0 ? `${m} เดือน` : "ไม่ถึง 1 เดือน";
  return { text, months };
}

type Tone = "ok" | "bad" | "info";
const ICON: Record<Tone, { mark: string; cls: string }> = {
  ok: { mark: "✔", cls: "text-green-700" },
  bad: { mark: "✖", cls: "text-red-700" },
  info: { mark: "•", cls: "text-wiki-muted" },
};

export interface PartnerCheckItem {
  tone: Tone;
  label: string;
  value: React.ReactNode;
}

/** รายการข้อเท็จจริงสำหรับตรวจสอบคู่ค้า (ใช้ทั้งกล่องบนหน้าบริษัทและรายงานสำหรับพิมพ์) — ไม่ให้คะแนน/ไม่ตัดสินแทนผู้ใช้ */
export function partnerCheckItems(p: {
  profile: JuristicProfile;
  vat: VatInfo | null;
  procurement: ProcurementSummary | null | undefined;
  sameAddressTotal: number;
  latestChange: JuristicChange | null;
  verified: boolean;
  tisi?: TisiInfo | null;
}): PartnerCheckItem[] {
  const { profile } = p;
  const active = profile.status === "active";
  const age = companyAge(profile.registerDate);
  const items: PartnerCheckItem[] = [
    { tone: active ? "ok" : "bad", label: "สถานะ", value: profile.statusText },
    {
      tone: "info",
      label: "อายุกิจการ",
      value: age ? `${age.text} (จดทะเบียน ${formatThaiDate(profile.registerDate)})` : "-",
    },
    { tone: "info", label: "ทุนจดทะเบียน", value: formatBaht(profile.registerCapital) },
  ];
  if (p.vat?.loaded) {
    items.push({
      tone: p.vat.registered ? "ok" : "info",
      label: "ภาษีมูลค่าเพิ่ม",
      value: p.vat.registered
        ? `จดทะเบียน VAT${p.vat.since ? ` ตั้งแต่ ${formatThaiDate(p.vat.since)}` : ""}${p.vat.totalBranches > 1 ? ` · ${formatNumber(p.vat.totalBranches)} สถานประกอบการ` : ""}`
        : "ไม่พบในทะเบียน VAT",
    });
  }
  // มอก. แสดงเฉพาะเมื่อมี (กิจการที่ไม่ได้ผลิตสินค้าควบคุมไม่ต้องมี มอก. — การไม่มีจึงไม่มีความหมาย)
  if (p.tisi?.total) {
    items.push({ tone: "ok", label: "ใบอนุญาต มอก.", value: `${formatNumber(p.tisi.total)} ฉบับ` });
  }
  items.push({
    tone: p.procurement ? "ok" : "info",
    label: "งานภาครัฐ",
    value: p.procurement
      ? `${formatNumber(p.procurement.contracts)} สัญญา รวม ${formatBaht(p.procurement.totalValue)}${p.procurement.lastSign ? ` · ล่าสุด ${formatThaiDate(p.procurement.lastSign)}` : ""}`
      : "ไม่พบสัญญาในระบบ e-GP",
  });
  if (p.latestChange) {
    items.push({
      tone: "info",
      label: "เปลี่ยนแปลงล่าสุด",
      value: `${CHANGE_LABELS[p.latestChange.field]} (ตรวจพบ ${new Date(p.latestChange.detectedAt).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" })})`,
    });
  }
  if (p.sameAddressTotal > 0) {
    items.push({ tone: "info", label: "ที่อยู่เดียวกัน", value: `มีนิติบุคคลอื่นจดที่อยู่นี้ ${formatNumber(p.sameAddressTotal)} ราย` });
  }
  if (p.verified) items.push({ tone: "ok", label: "บัญชีบริษัท", value: "เจ้าของกิจการยืนยันตัวตนกับ ThaiDataCorp แล้ว" });
  return items;
}

export function PartnerCheckList({ items }: { items: PartnerCheckItem[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="flex gap-2">
          <span aria-hidden="true" className={`w-4 shrink-0 text-center font-bold ${ICON[it.tone].cls}`}>
            {ICON[it.tone].mark}
          </span>
          <dt className="w-28 shrink-0 text-wiki-muted">{it.label}</dt>
          <dd className="min-w-0">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** กล่อง "ตรวจสอบคู่ค้า" ด้านบนหน้าบริษัท — สรุปสิ่งที่คนมาเช็กบ่อยที่สุดไว้ที่เดียว */
export default function PartnerCheck({ id, items }: { id: string; items: PartnerCheckItem[] }) {
  return (
    <section aria-labelledby="partner-check-h" className="mb-5 border border-wiki-border bg-wiki-bg px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id="partner-check-h" className="font-bold">
          ตรวจสอบคู่ค้าโดยย่อ
        </h2>
        <span className="text-xs text-wiki-muted">ข้อเท็จจริงจากแหล่งข้อมูลทางการ — ใช้ประกอบการพิจารณา</span>
      </div>
      <PartnerCheckList items={items} />
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={`/company/${id}/report`}
          rel="nofollow"
          className="border border-wiki-link bg-wiki-link px-3 py-1 font-bold text-white! hover:no-underline hover:opacity-90"
        >
          🖨 รายงานตรวจสอบคู่ค้า (พิมพ์ / PDF)
        </Link>
        <WatchButton kind="company" target={id} back={`/company/${id}`} label="แจ้งเตือนเมื่อบริษัทนี้เปลี่ยนแปลง" />
        <span className="text-xs text-wiki-muted">สมาชิกใช้ฟรี</span>
      </div>
    </section>
  );
}
