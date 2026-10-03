"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { submitContact, type ContactFormState } from "@/app/contact/actions";

const inputCls = "w-full min-w-0 border border-wiki-border bg-white px-3 py-1.5 outline-none focus:border-wiki-link";
const labelCls = "flex flex-col gap-1 text-sm";

const ERRORS: Record<string, string> = {
  type: "กรุณาเลือกประเภทคำร้อง",
  name: "กรุณากรอกชื่อ–นามสกุล",
  email: "รูปแบบอีเมลไม่ถูกต้อง",
  juristic: "กรุณาระบุเลขทะเบียนนิติบุคคล 13 หลักที่ถูกต้อง",
  relation: "การเพิ่มข้อมูลติดต่อทำได้เฉพาะเจ้าของกิจการ กรรมการ หรือพนักงานที่ได้รับมอบหมาย",
  message: "กรุณาระบุรายละเอียดอย่างน้อย 10 ตัวอักษร",
  consent: "กรุณายินยอมให้ใช้ข้อมูลเพื่อดำเนินการตามคำร้อง",
  rate: "ส่งคำร้องบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  spam: "ไม่สามารถส่งคำร้องได้",
  "too-fast": "ส่งเร็วเกินไป กรุณาตรวจสอบข้อมูลแล้วกดส่งอีกครั้ง",
  "contact-empty": "กรุณากรอกข้อมูลติดต่ออย่างน้อย 1 ช่อง",
  "contact-phone": "รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง",
  "contact-email": "รูปแบบอีเมลของกิจการไม่ถูกต้อง",
  "contact-website": "รูปแบบเว็บไซต์ไม่ถูกต้อง",
  "contact-facebook": "ลิงก์ Facebook ต้องเป็น facebook.com",
  "contact-line": "รูปแบบ LINE ID ไม่ถูกต้อง",
};

export default function ContactForm({
  types,
  relations,
  defaults,
  startedAt,
}: {
  types: Array<{ value: string; label: string; help: string; needsCompany: boolean }>;
  relations: Array<{ value: string; label: string }>;
  defaults: Record<string, string>;
  startedAt: number;
}) {
  const [state, action, pending] = useActionState<ContactFormState, FormData>(submitContact, {});
  const values = { ...defaults, ...state.values };
  const [type, setType] = useState(values.type || "correction");
  const def = types.find((t) => t.value === type) ?? types[0];
  const v = (k: string) => values[k] ?? "";

  return (
    <form key={state.n ?? 0} action={action} className="max-w-3xl space-y-4">
      {state.error && (
        <p role="alert" className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {ERRORS[state.error] ?? "ไม่สามารถส่งคำร้องได้ กรุณาลองใหม่"}
        </p>
      )}
      <input type="hidden" name="t" value={startedAt} />
      <input type="hidden" name="pageUrl" value={v("pageUrl")} />
      {/* ช่องล่อบอท — คนมองไม่เห็น */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          เว็บไซต์บริษัท <input type="text" name="company_website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset className="border border-wiki-border-light p-4">
        <legend className="px-1 text-sm font-bold">1. เรื่องที่ต้องการแจ้ง</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {types.map((t) => (
            <label key={t.value} className={`flex cursor-pointer items-start gap-2 border px-3 py-2 text-sm ${type === t.value ? "border-wiki-text bg-wiki-bg" : "border-wiki-border-light"}`}>
              <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="mt-1" />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
        {def.help && <p className="mt-2 text-xs text-wiki-muted">{def.help}</p>}
      </fieldset>

      <fieldset className="border border-wiki-border-light p-4">
        <legend className="px-1 text-sm font-bold">2. นิติบุคคลที่เกี่ยวข้อง {def.needsCompany ? "(จำเป็น)" : "(ถ้ามี)"}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            เลขทะเบียนนิติบุคคล 13 หลัก
            <input name="juristicId" inputMode="numeric" defaultValue={v("juristicId")} required={def.needsCompany} placeholder="เช่น 0105559140065" className={inputCls} />
          </label>
          {v("companyName") && (
            <p className="self-end pb-2 text-sm">
              <Link href={`/company/${v("juristicId")}`}>{v("companyName")}</Link>
            </p>
          )}
        </div>
      </fieldset>

      {type === "contact" && (
        <fieldset className="border border-wiki-border-light p-4">
          <legend className="px-1 text-sm font-bold">3. ข้อมูลติดต่อของกิจการที่ต้องการแสดง</legend>
          <p className="mb-3 text-xs text-wiki-muted">
            กรอกเฉพาะช่องที่ต้องการแสดงบนหน้าบริษัท — เราจะตรวจสอบกับเจ้าของกิจการก่อนเผยแพร่ ข้อมูลเดิม (ถ้ามี) จะถูกแทนที่ทั้งชุด
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              เบอร์โทรศัพท์
              <input name="c_phone" defaultValue={v("c_phone")} placeholder="เช่น 02-123-4567" className={inputCls} />
            </label>
            <label className={labelCls}>
              อีเมลของกิจการ
              <input name="c_email" type="email" defaultValue={v("c_email")} className={inputCls} />
            </label>
            <label className={labelCls}>
              เว็บไซต์
              <input name="c_website" defaultValue={v("c_website")} placeholder="www.example.co.th" className={inputCls} />
            </label>
            <label className={labelCls}>
              LINE Official / LINE ID
              <input name="c_lineId" defaultValue={v("c_lineId")} placeholder="@example" className={inputCls} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Facebook Page
              <input name="c_facebook" defaultValue={v("c_facebook")} placeholder="facebook.com/example" className={inputCls} />
            </label>
          </div>
        </fieldset>
      )}

      <fieldset className="border border-wiki-border-light p-4">
        <legend className="px-1 text-sm font-bold">{type === "contact" ? "4" : "3"}. รายละเอียด</legend>
        <div className="space-y-3">
          <label className={labelCls}>
            หัวข้อ
            <input name="subject" defaultValue={v("subject")} maxLength={255} className={inputCls} />
          </label>
          <label className={labelCls}>
            รายละเอียด {type !== "contact" && <span className="text-wiki-muted">(จำเป็น)</span>}
            <textarea
              name="message"
              rows={6}
              defaultValue={v("message")}
              required={type !== "contact"}
              maxLength={5000}
              placeholder={type === "correction" ? "ข้อมูลที่แสดงอยู่: ...\nข้อมูลที่ถูกต้อง: ...\nแหล่งอ้างอิง: ..." : ""}
              className={inputCls}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="border border-wiki-border-light p-4">
        <legend className="px-1 text-sm font-bold">{type === "contact" ? "5" : "4"}. ข้อมูลผู้แจ้ง (สำหรับติดต่อกลับ ไม่เผยแพร่)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            ชื่อ–นามสกุล
            <input name="name" required defaultValue={v("name")} autoComplete="name" className={inputCls} />
          </label>
          <label className={labelCls}>
            อีเมล
            <input name="email" type="email" required defaultValue={v("email")} autoComplete="email" className={inputCls} />
          </label>
          <label className={labelCls}>
            เบอร์โทรศัพท์ (ถ้ามี)
            <input name="phone" defaultValue={v("phone")} autoComplete="tel" className={inputCls} />
          </label>
          <label className={labelCls}>
            ความเกี่ยวข้องกับนิติบุคคล
            <select name="relation" defaultValue={v("relation") || (type === "contact" ? "owner" : "public")} className={inputCls}>
              {relations.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" value="1" required className="mt-1" />
        <span>
          ยินยอมให้ ThaiDataCorp ใช้ข้อมูลข้างต้นเพื่อตรวจสอบและดำเนินการตามคำร้อง และติดต่อกลับ ตาม
          <Link href="/terms">นโยบายความเป็นส่วนตัว</Link>
        </span>
      </label>

      <button type="submit" disabled={pending} className="bg-wiki-text px-6 py-2 font-bold text-white hover:bg-[#3a3d40] disabled:opacity-60">
        {pending ? "กำลังส่ง…" : "ส่งคำร้อง"}
      </button>
    </form>
  );
}
