/**
 * ส่งอีเมลผ่าน SMTP (เช่น เมลเซิร์ฟเวอร์ของ Plesk) — ใช้ทั้งเว็บและสคริปต์แจ้งเตือน
 *
 * .env.local:
 *   SMTP_HOST=mail.thaidatacorp.com
 *   SMTP_PORT=587               # 465 = SSL
 *   SMTP_USER=no-reply@thaidatacorp.com
 *   SMTP_PASS="..."
 *   MAIL_FROM="ThaiDataCorp <no-reply@thaidatacorp.com>"
 *   MAIL_REPLY_TO=info@thaidatacorp.com   # ไม่บังคับ — ปลายทางเมื่อผู้รับกดตอบกลับ
 *
 * ถ้ายังไม่ได้ตั้งค่า: โหมดพัฒนาจะพิมพ์อีเมลลง console แทนการส่ง (isMailConfigured() = false)
 */
import nodemailer, { type Transporter } from "nodemailer";

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

const g = globalThis as unknown as { __tdcMailer?: Transporter };

function transporter(): Transporter {
  g.__tdcMailer ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return g.__tdcMailer;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!isMailConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP is not configured");
    console.log(`\n[mail:dev] ถึง ${mail.to}\n  เรื่อง: ${mail.subject}\n${mail.text.replace(/^/gm, "  ")}\n`);
    return;
  }
  await transporter().sendMail({
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
    // ผู้รับกดตอบกลับ → ไปที่อีเมลติดต่อของเว็บ (เช่น info@) แม้ส่งผ่าน Gmail
    ...(process.env.MAIL_REPLY_TO && { replyTo: process.env.MAIL_REPLY_TO }),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
