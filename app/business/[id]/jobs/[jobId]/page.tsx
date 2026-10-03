import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveJob } from "@/app/business/actions";
import { ProvinceSelect } from "@/components/FilterForms";
import FileGuard from "@/components/FileGuard";
import FilePicker from "@/components/FilePicker";
import Panel, { inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { mediaUrl } from "@/lib/uploads";
import { requireUser } from "@/lib/auth";
import { EMPLOYMENT_TYPES, getJob, isCompanyMember, JOB_DAYS_DEFAULT, JOB_DAYS_MAX, postsThisMonth, quotas } from "@/lib/business";
import { listProvinces } from "@/lib/search-repo";
import { getJuristicContact } from "@/lib/support";

export const metadata: Metadata = { title: "ประกาศรับสมัครงาน", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string; jobId: string }>; searchParams: Promise<{ error?: string }> };

const ERRORS: Record<string, string> = {
  rules: "กรุณายืนยันว่าประกาศเป็นไปตามเงื่อนไข",
  title: "กรุณากรอกชื่อตำแหน่ง (อย่างน้อย 4 ตัวอักษร)",
  type: "กรุณาเลือกประเภทงาน",
  province: "กรุณาเลือกจังหวัดที่ทำงาน",
  description: "กรุณากรอกรายละเอียดงาน (อย่างน้อย 20 ตัวอักษร)",
  salary: "เงินเดือนสูงสุดต้องไม่น้อยกว่าขั้นต่ำ",
  contact: "กรุณาระบุช่องทางติดต่ออย่างน้อย 1 ช่อง (อีเมลต้องถูกรูปแบบ)",
  "image-too-large": "รูปใหญ่เกิน 3MB",
  "image-bad-type": "รูปต้องเป็น JPG, PNG หรือ WebP",
  "image-bad-image": "อ่านไฟล์รูปไม่ได้",
  "image-storage": "บันทึกรูปไม่สำเร็จ (ปัญหาฝั่งเซิร์ฟเวอร์) กรุณาลองใหม่ภายหลัง",
  "image-empty": "ไฟล์รูปว่าง",
};

const field = "flex flex-col gap-1";

export default async function JobFormPage({ params, searchParams }: Props) {
  const { id, jobId } = await params;
  const user = await requireUser(`/business/${id}/jobs/${jobId}`);
  if (!(await isCompanyMember(user.id, id))) redirect("/business?error=not-member");
  const isNew = jobId === "new";
  const job = isNew ? null : await getJob(Number(jobId));
  if (!isNew && (!job || job.juristicId !== id || job.status === "hidden")) notFound();
  if (isNew && (await postsThisMonth("job_post", id)) >= (await quotas()).jobs) redirect(`/business/${id}?error=job-quota#jobs`);
  const [provinces, contact] = await Promise.all([listProvinces(), getJuristicContact(id)]);
  const error = ERRORS[(await searchParams).error ?? ""];

  return (
    <Panel
      title={isNew ? "ลงประกาศรับสมัครงาน" : `แก้ไขประกาศ: ${job!.title}`}
      crumbs={[{ label: "บัญชีบริษัท", href: "/business" }, { label: "จัดการ", href: `/business/${id}` }, { label: "ประกาศงาน" }]}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Notice>
        ผู้สมัครจะติดต่อบริษัทของคุณโดยตรงตามช่องทางที่ระบุ — ThaiDataCorp เป็นเพียงพื้นที่ลงประกาศ{" "}
        <b>ห้ามเรียกเก็บเงินจากผู้สมัครทุกกรณี</b>
      </Notice>
      <form action={saveJob} encType="multipart/form-data" className="grid max-w-4xl gap-3 text-sm sm:grid-cols-2">
        <input type="hidden" name="juristicId" value={id} />
        <input type="hidden" name="jobId" value={isNew ? "" : String(job!.id)} />
        <label className={`${field} sm:col-span-2`}>
          ชื่อตำแหน่ง
          <input name="title" required minLength={4} maxLength={200} defaultValue={job?.title} className={inputCls} />
        </label>
        <label className={field}>
          ประเภทงาน
          <select name="employmentType" defaultValue={job?.employmentType ?? "FULL_TIME"} className={inputCls}>
            {Object.entries(EMPLOYMENT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          จำนวนที่รับ (อัตรา)
          <input name="positions" type="number" min={1} max={999} defaultValue={job?.positions ?? 1} className={inputCls} />
        </label>
        <label className={field}>
          จังหวัดที่ทำงาน
          <ProvinceSelect provinces={provinces} value={job?.province} all="เลือกจังหวัด" />
        </label>
        <label className={field}>
          สถานที่ทำงาน (เขต/อำเภอ หรือที่อยู่)
          <input name="location" maxLength={255} defaultValue={job?.location ?? ""} className={inputCls} />
        </label>
        <label className={field}>
          เงินเดือนขั้นต่ำ (บาท)
          <input name="salaryMin" inputMode="numeric" defaultValue={job?.salaryMin ?? ""} className={inputCls} />
        </label>
        <label className={field}>
          เงินเดือนสูงสุด (บาท)
          <input name="salaryMax" inputMode="numeric" defaultValue={job?.salaryMax ?? ""} className={inputCls} />
        </label>
        <label className={`${field} sm:col-span-2`}>
          หมายเหตุเงินเดือน (เช่น ตามตกลง, ตามประสบการณ์, รายวัน)
          <input name="salaryNote" maxLength={100} defaultValue={job?.salaryNote ?? ""} className={inputCls} />
        </label>
        <label className={`${field} sm:col-span-2`}>
          รายละเอียดงาน
          <textarea name="description" required minLength={20} maxLength={5000} rows={7} defaultValue={job?.description} className={inputCls} />
        </label>
        <label className={field}>
          คุณสมบัติผู้สมัคร
          <textarea name="qualifications" maxLength={3000} rows={5} defaultValue={job?.qualifications ?? ""} className={inputCls} />
        </label>
        <label className={field}>
          สวัสดิการ
          <textarea name="benefits" maxLength={3000} rows={5} defaultValue={job?.benefits ?? ""} className={inputCls} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          {job?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(job.image)!} alt="รูปปัจจุบัน" className="h-20 border border-wiki-border-light object-cover" />
          )}
          <div className={`${field} min-w-72 flex-1`}>
            <b>รูปประกอบประกาศ (ไม่บังคับ)</b>
            <FilePicker name="image" accept="image/jpeg,image/png,image/webp" types="image/jpeg,image/png,image/webp" maxMb={3} hint="JPG, PNG, WebP · ไม่เกิน 3MB · ย่อเป็น 1200px อัตโนมัติ" />
            <FileGuard />
          </div>
          {job?.image && (
            <label className="flex items-center gap-1">
              <input type="checkbox" name="removeImage" value="1" /> ลบรูป
            </label>
          )}
        </div>

        <h3 className="mt-2 font-bold sm:col-span-2">ช่องทางให้ผู้สมัครติดต่อ (อย่างน้อย 1 ช่อง)</h3>
        <label className={field}>
          ชื่อผู้ติดต่อ / ฝ่าย
          <input name="contactName" maxLength={255} defaultValue={job?.contactName ?? "ฝ่ายบุคคล"} className={inputCls} />
        </label>
        <label className={field}>
          เบอร์โทรศัพท์
          <input name="contactPhone" maxLength={64} defaultValue={job?.contactPhone ?? contact?.phone ?? ""} className={inputCls} />
        </label>
        <label className={field}>
          อีเมล
          <input name="contactEmail" type="email" maxLength={255} defaultValue={job?.contactEmail ?? contact?.email ?? ""} className={inputCls} />
        </label>
        <label className={field}>
          LINE ID
          <input name="contactLine" maxLength={100} defaultValue={job?.contactLine ?? contact?.lineId ?? ""} className={inputCls} />
        </label>
        <label className={field}>
          {isNew ? "แสดงประกาศนาน (วัน)" : "ต่ออายุประกาศอีก (วัน นับจากวันนี้)"}
          <input name="days" type="number" min={7} max={JOB_DAYS_MAX} defaultValue={JOB_DAYS_DEFAULT} className={inputCls} />
        </label>

        <label className="flex items-start gap-2 sm:col-span-2">
          <input type="checkbox" name="rules" value="1" required className="mt-1" />
          <span>
            ยืนยันว่าเป็นตำแหน่งงานจริงของบริษัท ไม่เรียกเก็บเงินจากผู้สมัคร ไม่เลือกปฏิบัติโดยไม่จำเป็นต่อลักษณะงาน
            และงานต่างประเทศ/รับคนต่างด้าวเป็นไปตามกฎหมาย — ตาม <Link href="/terms#business" target="_blank">เงื่อนไขการลงประกาศ</Link>
          </span>
        </label>
        <div className="flex gap-3 sm:col-span-2">
          <button type="submit" className={primaryButtonCls}>
            {isNew ? "ลงประกาศ" : "บันทึก"}
          </button>
          <Link href={`/business/${id}#jobs`} className="self-center">
            ยกเลิก
          </Link>
        </div>
      </form>
    </Panel>
  );
}
