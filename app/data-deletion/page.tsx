import type { Metadata } from "next";
import Link from "next/link";
import Panel, { Notice } from "@/components/Panel";
import { SITE_NAME } from "@/lib/format";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = {
  title: "การลบข้อมูลผู้ใช้",
  description: `วิธีขอลบบัญชีและข้อมูลส่วนบุคคลของผู้ใช้ ${SITE_NAME} รวมถึงข้อมูลที่ได้รับจากการเข้าสู่ระบบด้วย Facebook`,
  alternates: { canonical: "/data-deletion" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * หน้า "Data Deletion Instructions URL" ที่ Facebook Login กำหนดให้ต้องมี
 * และหน้าสถานะที่ callback (/auth/facebook/data-deletion) ส่งผู้ใช้มาพร้อม ?code=
 */
export default async function DataDeletionPage({ searchParams }: Props) {
  const raw = (await searchParams).code;
  const code = (Array.isArray(raw) ? raw[0] : raw)?.replace(/[^A-Z0-9]/gi, "").slice(0, 32);
  const email = (await getSetting("support_email")) || "privacy@thaidatacorp.com";
  return (
    <Panel title="การลบข้อมูลผู้ใช้" crumbs={[{ label: "การลบข้อมูล" }]}>
      {code && (
        <Notice tone="ok">
          ได้รับคำขอลบข้อมูลจาก Facebook แล้ว (รหัสยืนยัน <b className="font-mono">{code}</b>) — ลบการเชื่อมบัญชีและข้อมูลที่ได้รับจาก
          Facebook ออกจากระบบเรียบร้อย หากต้องการลบบัญชีสมาชิกทั้งหมดด้วย ดูวิธีด้านล่าง
        </Notice>
      )}
      <div className="space-y-4 text-sm leading-7">
        <p>
          {SITE_NAME} เก็บข้อมูลของสมาชิกเท่าที่จำเป็น ได้แก่ อีเมล รายการที่ติดตาม เงื่อนไขแจ้งเตือน และ (ถ้าเข้าสู่ระบบด้วย Facebook)
          รหัสผู้ใช้สำหรับแอปนี้และชื่อที่แสดงบน Facebook
        </p>
        <h2 className="wiki-h2">ยกเลิกการเชื่อม Facebook</h2>
        <ol className="list-decimal space-y-1 pl-6">
          <li>
            เข้าสู่ระบบแล้วไปที่ <Link href="/account#login-methods">บัญชีของฉัน → วิธีเข้าสู่ระบบ</Link> กด &ldquo;ยกเลิกการเชื่อม&rdquo;
            — ข้อมูล Facebook จะถูกลบออกจากระบบทันที
          </li>
          <li>
            หรือลบแอปจากฝั่ง Facebook: การตั้งค่า → แอปและเว็บไซต์ → เลือก {SITE_NAME} → ลบ
          </li>
        </ol>
        <h2 className="wiki-h2">ลบบัญชีและข้อมูลทั้งหมด</h2>
        <p>
          ส่งอีเมลจากอีเมลที่ใช้สมัครมาที่ <a href={`mailto:${email}?subject=ขอลบบัญชี ${SITE_NAME}`}>{email}</a> หัวข้อ
          &ldquo;ขอลบบัญชี&rdquo; เราจะลบบัญชี รายการที่ติดตาม เงื่อนไขแจ้งเตือน และข้อมูลที่ได้รับจาก Facebook ภายใน 30 วัน
          และแจ้งยืนยันกลับทางอีเมล
        </p>
      </div>
    </Panel>
  );
}
