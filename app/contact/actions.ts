"use server";
/**
 * ส่งคำร้องจากหน้า /contact — ตรวจข้อมูล กันสแปม บันทึก แล้วแจ้งทางอีเมล (ถ้าตั้ง SMTP)
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, normalizeEmail } from "@/lib/auth";
import { SITE_NAME, SITE_URL } from "@/lib/format";
import { isValidJuristicId } from "@/lib/juristic-id";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { getSupportEmail } from "@/lib/settings";
import {
  cleanContact,
  createRequest,
  hashIp,
  isRequestType,
  recentRequestCount,
  RELATIONS,
  REQUEST_TYPES,
  type ContactInfo,
} from "@/lib/support";

export interface ContactFormState {
  error?: string;
  /** ค่าที่กรอกไว้ — ส่งกลับไปให้ฟอร์มเติมค่าเดิมเมื่อมีข้อผิดพลาด */
  values?: Record<string, string>;
  /** เปลี่ยนทุกครั้งที่ตอบกลับ (ให้ฟอร์ม remount ด้วยค่าใหม่) */
  n?: number;
}

const FIELDS = ["type", "juristicId", "pageUrl", "name", "email", "phone", "relation", "subject", "message",
  "c_phone", "c_email", "c_website", "c_lineId", "c_facebook"] as const;

export async function submitContact(prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const v = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "").trim()])) as Record<(typeof FIELDS)[number], string>;
  const fail = (error: string): ContactFormState => ({ error, values: v, n: (prev.n ?? 0) + 1 });

  // กันบอท: ช่องล่อ (มองไม่เห็นสำหรับคน) ต้องว่าง + ต้องใช้เวลากรอกเกิน 3 วินาที
  if (String(formData.get("company_website") ?? "") !== "") return fail("spam");
  const started = Number(formData.get("t") ?? 0);
  if (!started || Date.now() - started < 3000) return fail("too-fast");

  if (!isRequestType(v.type)) return fail("type");
  const def = REQUEST_TYPES[v.type];
  const name = v.name.slice(0, 100);
  if (name.length < 2) return fail("name");
  const email = normalizeEmail(v.email);
  if (!email) return fail("email");
  const juristicId = v.juristicId.replace(/\D/g, "");
  if (juristicId && !isValidJuristicId(juristicId)) return fail("juristic");
  if (def.needsCompany && !juristicId) return fail("juristic");
  const relation = v.relation in RELATIONS ? v.relation : null;

  let contact: ContactInfo | null = null;
  if (v.type === "contact") {
    if (relation !== "owner" && relation !== "employee") return fail("relation");
    const c = cleanContact({ phone: v.c_phone, email: v.c_email, website: v.c_website, lineId: v.c_lineId, facebook: v.c_facebook });
    if ("error" in c) return fail(c.error);
    contact = c.contact;
  }
  const message = v.message.slice(0, 5000) || (v.type === "contact" ? "ขอเพิ่ม/แก้ไขข้อมูลติดต่อของกิจการ" : "");
  if (message.length < 10) return fail("message");
  if (formData.get("consent") !== "1") return fail("consent");

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const ipHash = hashIp(ip);
  if ((await recentRequestCount(ipHash, email)) >= 5) return fail("rate");

  const user = await getCurrentUser();
  const pageUrl = v.pageUrl.startsWith("/") ? v.pageUrl.slice(0, 500) : null;
  const ticket = await createRequest({
    type: v.type, juristicId: juristicId || null, pageUrl, name, email, phone: v.phone.slice(0, 64) || null, relation,
    subject: v.subject.slice(0, 255) || null, message, contact, userId: user?.id ?? null, ipHash,
  });

  // แจ้งทางอีเมล — ถ้ายังไม่ตั้ง SMTP คำร้องยังถูกบันทึก ผู้ดูแลดูได้ที่ /admin/requests
  if (isMailConfigured()) {
    const support = await getSupportEmail();
    const summary = [
      `เลขที่คำร้อง: ${ticket}`,
      `ประเภท: ${def.label}`,
      juristicId && `นิติบุคคล: ${juristicId} (${SITE_URL}/company/${juristicId})`,
      `ผู้แจ้ง: ${name} <${email}>${v.phone ? ` โทร ${v.phone}` : ""}${relation ? ` (${RELATIONS[relation as keyof typeof RELATIONS]})` : ""}`,
      v.subject && `หัวข้อ: ${v.subject}`,
      contact && `ข้อมูลติดต่อที่ขอเพิ่ม: ${JSON.stringify(contact)}`,
      "",
      message,
    ].filter((x): x is string => typeof x === "string").join("\n");
    await Promise.allSettled([
      sendMail({ to: support, subject: `[${ticket}] ${def.label}`, text: `${summary}\n\nจัดการที่ ${SITE_URL}/admin/requests` }),
      sendMail({
        to: email,
        subject: `${SITE_NAME} ได้รับคำร้องของคุณแล้ว (${ticket})`,
        text:
          `เรียน คุณ${name}\n\n${SITE_NAME} ได้รับคำร้อง "${def.label}" เลขที่ ${ticket} แล้ว ` +
          `เราจะตรวจสอบและติดต่อกลับภายใน 3 วันทำการ\n` +
          `ติดตามสถานะได้ที่ ${SITE_URL}/contact/status?ticket=${ticket}\n\n${SITE_NAME}\n${support}`,
      }),
    ]);
  }

  redirect(`/contact/sent?ticket=${encodeURIComponent(ticket)}`);
}
