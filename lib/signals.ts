/**
 * "ข้อสังเกตจากข้อมูลสาธารณะ" — ข้อเท็จจริงเชิงตัวเลขที่ผู้ตรวจสอบคู่ค้ามักดู
 * ไม่ใช่คะแนนความเสี่ยงและไม่ได้บ่งชี้การกระทำผิด จึงเขียนเป็นข้อเท็จจริงล้วน ๆ และแสดงเกณฑ์ที่ใช้
 */
import { formatNumber, formatThaiDate } from "@/lib/format";
import type { CompanySignal, JuristicProfile, ProcurementSummary } from "@/types/company";

export type Signal = CompanySignal;

const MIN_VALUE = 5_000_000;

function monthsBetween(a: string, b: string): number {
  const d1 = new Date(`${a}T00:00:00Z`);
  const d2 = new Date(`${b}T00:00:00Z`);
  return (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + (d2.getUTCMonth() - d1.getUTCMonth());
}

export function computeSignals(input: {
  profile: JuristicProfile;
  procurement?: ProcurementSummary | null;
  priceEqualsRef?: { competitive: number; equal: number };
  sameAddressTotal?: number;
  sameAddressWithGov?: number;
}): Signal[] {
  const { profile: p, procurement: pr } = input;
  const out: Signal[] = [];

  if (pr && pr.totalValue >= MIN_VALUE) {
    // 1) ได้สัญญาภาครัฐไม่นานหลังจดทะเบียน
    if (p.registerDate && pr.firstSign) {
      const m = monthsBetween(p.registerDate, pr.firstSign);
      if (m >= 0 && m < 12) {
        out.push({
          key: "young",
          title: "ได้รับสัญญาภาครัฐภายใน 1 ปีหลังจดทะเบียน",
          detail: `จดทะเบียนเมื่อ ${formatThaiDate(p.registerDate)} และลงนามสัญญาภาครัฐครั้งแรกในฐานข้อมูลเมื่อ ${formatThaiDate(pr.firstSign)} (ประมาณ ${m} เดือนหลังจดทะเบียน) มูลค่าสัญญารวม ${formatNumber(pr.totalValue)} บาท`,
        });
      }
    }
    // 2) มูลค่าสัญญาสูงเมื่อเทียบกับทุนจดทะเบียน
    if (p.registerCapital > 0 && pr.totalValue >= 20 * p.registerCapital) {
      out.push({
        key: "capital",
        title: "มูลค่าสัญญาสูงเมื่อเทียบกับทุนจดทะเบียน",
        detail: `มูลค่าสัญญาภาครัฐรวม ${formatNumber(pr.totalValue)} บาท คิดเป็นประมาณ ${formatNumber(Math.round(pr.totalValue / p.registerCapital))} เท่าของทุนจดทะเบียน (${formatNumber(p.registerCapital)} บาท)`,
      });
    }
    // 3) รายได้ภาครัฐกระจุกที่หน่วยงานเดียว
    const top = pr.topAgencies[0];
    if (top && pr.contracts >= 5 && top.value / pr.totalValue >= 0.8) {
      out.push({
        key: "concentration",
        title: "มูลค่าสัญญาส่วนใหญ่มาจากหน่วยงานเดียว",
        detail: `ร้อยละ ${((top.value / pr.totalValue) * 100).toFixed(0)} ของมูลค่าสัญญาทั้งหมดมาจาก ${top.agency} (${formatNumber(top.contracts)} จาก ${formatNumber(pr.contracts)} สัญญา)`,
      });
    }
  }

  // 4) ราคาที่ตกลงเท่ากับราคากลางในสัญญาแบบแข่งขัน
  const pe = input.priceEqualsRef;
  if (pe && pe.competitive >= 3 && pe.equal / pe.competitive >= 0.5) {
    out.push({
      key: "ref-price",
      title: "ราคาที่ตกลงเท่ากับราคากลางในสัญญาแบบประกวดราคา",
      detail: `${formatNumber(pe.equal)} จาก ${formatNumber(pe.competitive)} สัญญาที่ใช้วิธีประกวดราคา/e-bidding มีราคาที่ตกลงซื้อหรือจ้างเท่ากับราคากลางพอดี`,
    });
  }

  // 5) ที่อยู่จดทะเบียนใช้ร่วมกับนิติบุคคลอื่นจำนวนมาก
  if ((input.sameAddressTotal ?? 0) >= 3) {
    const gov = input.sameAddressWithGov ?? 0;
    out.push({
      key: "shared-address",
      title: "ที่อยู่จดทะเบียนเดียวกับนิติบุคคลอื่นหลายราย",
      detail: `มีนิติบุคคลอื่นอีก ${formatNumber(input.sameAddressTotal!)} รายในฐานข้อมูลที่จดทะเบียนที่อยู่เดียวกันทุกตัวอักษร${gov > 0 ? ` ในจำนวนที่แสดง ${formatNumber(gov)} รายเคยได้รับสัญญาภาครัฐ` : ""} (มักพบในที่อยู่สำนักงานบริการหรือออฟฟิศเสมือน)`,
    });
  }
  return out;
}
