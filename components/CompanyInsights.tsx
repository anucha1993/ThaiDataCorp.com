import Link from "next/link";
import { companyAge } from "@/components/PartnerCheck";
import { formatMillionBaht, formatNumber, inProvince, tsicUrl } from "@/lib/format";
import { getPeerStats, type PeerStats } from "@/lib/insights-repo";
import type { JuristicProfile } from "@/types/company";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** ประโยคเทียบทุน — ใช้คำต่างกันตามตำแหน่งในกลุ่ม (ไม่ใช่ประโยคเดียวทุกหน้า) */
function capitalSentence(capital: number, s: PeerStats, group: string): string {
  const median = formatMillionBaht(s.capitalMedian);
  if (capital <= 0) return "";
  // ทุนเท่าค่ากลางพอดี (มักเป็นตัวเลขกลม ๆ เช่น 1 ล้านบาท ที่หลายบริษัทใช้) — ไม่ใช่ "ต่ำกว่า"
  if (capital === s.capitalMedian) return `ทุนจดทะเบียน ${formatMillionBaht(capital)} เท่ากับค่ากลางของ${group} ซึ่งเป็นทุนที่พบบ่อยในธุรกิจนี้`;
  if (s.capitalBelow >= 0.9) return `ทุนจดทะเบียน ${formatMillionBaht(capital)} อยู่ในกลุ่มทุนสูงสุด 10% ของ${group} (ค่ากลางของกลุ่ม ${median})`;
  if (s.capitalBelow >= 0.6) return `ทุนจดทะเบียน ${formatMillionBaht(capital)} สูงกว่า ${pct(s.capitalBelow)} ของ${group} ซึ่งมีค่ากลางที่ ${median}`;
  if (s.capitalBelow >= 0.4) return `ทุนจดทะเบียน ${formatMillionBaht(capital)} ใกล้เคียงค่ากลางของ${group} (${median})`;
  return `ทุนจดทะเบียน ${formatMillionBaht(capital)} ต่ำกว่าค่ากลางของ${group} (${median}) — ราว ${pct(1 - s.capitalBelow)} ของกลุ่มมีทุนเท่ากันหรือสูงกว่า`;
}

function ageSentence(profile: JuristicProfile, s: PeerStats, group: string): string {
  const age = companyAge(profile.registerDate);
  if (!age || s.ageMedianYears == null || s.olderShare == null) return "";
  const median = s.ageMedianYears < 1 ? "ไม่ถึง 1 ปี" : `${s.ageMedianYears.toFixed(1)} ปี`;
  if (s.olderShare <= 0.1) return `เป็นหนึ่งในกิจการที่เปิดมานานที่สุดของ${group} (${age.text} เทียบกับค่ากลาง ${median})`;
  if (age.months < 12) return `เพิ่งจดทะเบียนได้ ${age.text} — ${group}มีอายุกิจการค่ากลาง ${median}`;
  return `เปิดกิจการมาแล้ว ${age.text} ${s.olderShare < 0.5 ? "นานกว่า" : "สั้นกว่า"}ค่ากลางของ${group}ที่ ${median}`;
}

/**
 * ส่วน "บทวิเคราะห์" บนหน้าบริษัท — สร้างจากสถิติจริงของกลุ่มเปรียบเทียบ (ข้อเท็จจริง ไม่ใช่คะแนน)
 * แสดงเฉพาะเมื่อกลุ่มเปรียบเทียบมีขนาดพอ
 */
export default async function CompanyInsights({ profile }: { profile: JuristicProfile }) {
  if (!profile.tsic) return null;
  const s = await getPeerStats({
    id: profile.id,
    tsic: profile.tsic.code,
    province: profile.address.province ?? null,
    capital: profile.registerCapital,
    registerDate: profile.registerDate,
  }).catch(() => null);
  if (!s) return null;

  const where = s.scope === "province" && profile.address.province ? inProvince(profile.address.province) : "ทั่วประเทศ";
  const group = `ธุรกิจเดียวกัน${where}`;
  const lines = [
    `ในฐานข้อมูลมีนิติบุคคลประเภท "${profile.tsic.description}" ${where}ที่ยังดำเนินกิจการ ${formatNumber(s.peers)} ราย` +
      (s.provinceShare != null ? ` คิดเป็น ${pct(s.provinceShare)} ของธุรกิจนี้ทั่วประเทศ` : "") +
      (s.newLast12m > 0 ? ` และมีรายใหม่เปิดใน 12 เดือนที่ผ่านมา ${formatNumber(s.newLast12m)} ราย` : ""),
    capitalSentence(profile.registerCapital, s, group),
    ageSentence(profile, s, group),
    s.vatShare != null ? `${pct(s.vatShare)} ของ${group}จดทะเบียนภาษีมูลค่าเพิ่ม` : "",
    s.govWinners > 0
      ? s.govRank
        ? `เคยได้สัญญาภาครัฐ โดยมีมูลค่ารวมเป็นอันดับ ${formatNumber(s.govRank)} จาก ${formatNumber(s.govWinners)} รายใน${group}ที่เคยได้งานรัฐ`
        : `ใน${group} มี ${formatNumber(s.govWinners)} รายที่เคยได้สัญญาภาครัฐ (บริษัทนี้ยังไม่พบในระบบ e-GP)`
      : "",
  ].filter(Boolean);

  return (
    <section id="insights" aria-labelledby="insights-h">
      <h2 id="insights-h" className="wiki-h2">
        เทียบกับธุรกิจเดียวกัน
      </h2>
      <ul className="list-disc space-y-1 pl-6 text-[0.95rem] leading-7">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-wiki-muted">
        คำนวณอัตโนมัติจากนิติบุคคลที่ยังดำเนินกิจการในฐานข้อมูล {"ThaiDataCorp"} ประเภทธุรกิจ (TSIC){" "}
        <Link href={tsicUrl(profile.tsic.code, s.scope === "province" ? (profile.address.province ?? undefined) : undefined)}>
          {profile.tsic.code}
        </Link>{" "}
        — เป็นสถิติเปรียบเทียบ ไม่ใช่การประเมินความน่าเชื่อถือของบริษัท
      </p>
    </section>
  );
}
