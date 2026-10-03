import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { submitClaim } from "@/app/business/actions";
import FileGuard from "@/components/FileGuard";
import Panel, { inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { getCompany } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isCompanyMember, pendingClaimFor } from "@/lib/business";
import { isValidJuristicId } from "@/lib/juristic-id";

export const metadata: Metadata = { title: "ยืนยันบัญชีบริษัท", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

const ERRORS: Record<string, string> = {
  juristic: "ไม่พบนิติบุคคลตามเลขทะเบียนนี้",
  pending: "คุณยื่นคำขอสำหรับบริษัทนี้แล้ว กำลังรอตรวจสอบ",
  name: "กรุณากรอกชื่อผู้ติดต่อ",
  phone: "กรุณากรอกเบอร์โทรศัพท์ที่ติดต่อได้",
  consent: "กรุณายืนยันอำนาจและให้ความยินยอม",
  certificate: "กรุณาแนบหนังสือรับรองนิติบุคคล 1 ไฟล์",
  identity: "กรุณาแนบสำเนาบัตร/หนังสือมอบอำนาจ 1–4 ไฟล์",
  "file-too-large": "ไฟล์ใหญ่เกิน 10MB",
  "file-bad-type": "รองรับเฉพาะไฟล์ PDF, JPG และ PNG",
  "file-empty": "ไฟล์ว่าง",
  "file-total": "ไฟล์รวมกันใหญ่เกิน 20MB — ลดขนาดหรือสแกนความละเอียดต่ำลง",
};

export default async function ClaimPage({ searchParams }: Props) {
  const q = await searchParams;
  const id = one(q.id).replace(/\D/g, "");
  const user = await requireUser(`/business/claim?id=${id}`);
  if (isValidJuristicId(id) && (await isCompanyMember(user.id, id))) redirect(`/business/${id}`);
  const company = isValidJuristicId(id) ? await getCompany(id).catch(() => null) : null;
  const pending = company ? await pendingClaimFor(user.id, id) : false;
  const error = ERRORS[one(q.error)];

  return (
    <Panel title="ยืนยันว่าเป็นเจ้าของบริษัท" crumbs={[{ label: "บัญชีบริษัท", href: "/business" }, { label: "ยืนยันบริษัท" }]}>
      {error && <Notice tone="error">{error}</Notice>}
      {!company ? (
        <form method="get" className="flex max-w-md gap-2">
          <input name="id" defaultValue={id} inputMode="numeric" required placeholder="เลขทะเบียนนิติบุคคล 13 หลัก" className={`${inputCls} flex-1`} />
          <button type="submit" className={primaryButtonCls}>
            ค้นหา
          </button>
        </form>
      ) : pending ? (
        <Notice>
          คุณยื่นคำขอสำหรับ <b>{company.profile.nameTh}</b> แล้ว กำลังรอผู้ดูแลตรวจสอบ — <Link href="/business">ดูสถานะ</Link>
        </Notice>
      ) : (
        <form action={submitClaim} encType="multipart/form-data" className="max-w-3xl space-y-4 text-sm">
          <input type="hidden" name="juristicId" value={id} />
          <div className="border border-wiki-border-light bg-wiki-bg px-4 py-3">
            นิติบุคคล: <b>{company.profile.nameTh}</b> <span className="font-mono text-wiki-muted">({id})</span>{" "}
            <Link href={`/company/${id}`}>ดูหน้าบริษัท</Link>
          </div>

          <fieldset className="grid gap-3 border border-wiki-border-light p-4 sm:grid-cols-2">
            <legend className="px-1 font-bold">ผู้ติดต่อ (ผู้ดูแลบัญชีบริษัท)</legend>
            <label className="flex flex-col gap-1">
              ชื่อ–นามสกุล
              <input name="contactName" required maxLength={255} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              ตำแหน่ง
              <input name="position" maxLength={100} placeholder="เช่น กรรมการผู้จัดการ, ฝ่ายบุคคล" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              เบอร์โทรศัพท์ (ผู้ดูแลอาจโทรยืนยัน)
              <input name="phone" required inputMode="tel" className={inputCls} />
            </label>
            <p className="self-end pb-2 text-xs text-wiki-muted">อีเมลบัญชี: {user.email}</p>
          </fieldset>

          <fieldset className="space-y-3 border border-wiki-border-light p-4">
            <legend className="px-1 font-bold">เอกสาร (PDF / JPG / PNG ไม่เกิน 10MB ต่อไฟล์)</legend>
            <label className="flex flex-col gap-1">
              1. หนังสือรับรองนิติบุคคล อายุไม่เกิน 6 เดือน
              <input type="file" name="certificate" required data-max-mb="10" data-types="application/pdf,image/jpeg,image/png" data-max-files="1" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" />
            </label>
            <label className="flex flex-col gap-1">
              2. สำเนาบัตรประชาชนกรรมการผู้มีอำนาจ — หรือ หนังสือมอบอำนาจ + สำเนาบัตรผู้รับมอบอำนาจ (เลือกได้หลายไฟล์ สูงสุด 4)
              <input type="file" name="identity" required multiple data-max-mb="10" data-types="application/pdf,image/jpeg,image/png" data-max-files="4" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" />
            </label>
            <FileGuard totalMb={20} />
            <p className="text-xs text-wiki-muted">
              ขนาดรวมทุกไฟล์ไม่เกิน 20MB · โปรดเขียนกำกับสำเนาว่า &ldquo;ใช้ยืนยันตัวตนกับ ThaiDataCorp เท่านั้น&rdquo; และปิดข้อมูลที่ไม่จำเป็น เช่น วันเกิด
              — เอกสารเปิดดูได้เฉพาะผู้ดูแลระบบ และ<b>ลบทิ้งทันทีหลังพิจารณา</b>
            </p>
          </fieldset>

          <label className="flex items-start gap-2">
            <input type="checkbox" name="authority" value="1" required className="mt-1" />
            <span>ข้าพเจ้าเป็นกรรมการผู้มีอำนาจ หรือได้รับมอบอำนาจจากบริษัทให้ดำเนินการนี้ และเอกสารที่แนบเป็นความจริง</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="consent" value="1" required className="mt-1" />
            <span>
              ยินยอมให้ ThaiDataCorp ใช้ข้อมูลและเอกสารเพื่อยืนยันตัวตน และยอมรับ{" "}
              <Link href="/terms#business" target="_blank">
                เงื่อนไขบัญชีบริษัทและการลงประกาศ
              </Link>
            </span>
          </label>
          <button type="submit" className={primaryButtonCls}>
            ส่งเอกสารยืนยัน
          </button>
        </form>
      )}
    </Panel>
  );
}
