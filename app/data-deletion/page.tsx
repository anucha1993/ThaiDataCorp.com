import type { Metadata } from "next";
import Link from "next/link";
import Panel from "@/components/Panel";
import { SITE_NAME } from "@/lib/format";
import { getSupportEmail } from "@/lib/settings";

export const metadata: Metadata = {
  title: "การลบข้อมูลผู้ใช้",
  description: `วิธีขอลบบัญชีและข้อมูลส่วนบุคคลของผู้ใช้ ${SITE_NAME} รวมถึงข้อมูลที่ได้รับจากการเข้าสู่ระบบด้วย Google`,
  alternates: { canonical: "/data-deletion" },
};

export const revalidate = 3600;

/** วิธีลบข้อมูลของสมาชิก (ลิงก์จาก /terms) */
export default async function DataDeletionPage() {
  const email = await getSupportEmail();
  return (
    <Panel title="การลบข้อมูลผู้ใช้" crumbs={[{ label: "การลบข้อมูล" }]}>
      <div className="space-y-4 text-sm leading-7">
        <p>
          {SITE_NAME} เก็บข้อมูลของสมาชิกเท่าที่จำเป็น ได้แก่ อีเมล รหัสผ่าน (แบบเข้ารหัสทางเดียว) รายการที่ติดตาม เงื่อนไขแจ้งเตือน
          และ (ถ้าเข้าสู่ระบบด้วย Google) รหัสบัญชี Google ชื่อ และอีเมล
        </p>
        <h2 className="wiki-h2">ยกเลิกการเชื่อม Google</h2>
        <ol className="list-decimal space-y-1 pl-6">
          <li>
            เข้าสู่ระบบแล้วไปที่ <Link href="/account#login-methods">บัญชีของฉัน → วิธีเข้าสู่ระบบ</Link> กด &ldquo;ยกเลิกการเชื่อม&rdquo;
            — ข้อมูลจาก Google จะถูกลบออกจากระบบทันที (ต้องตั้งรหัสผ่านก่อน เพื่อให้ยังเข้าสู่ระบบได้)
          </li>
          <li>
            หรือถอนสิทธิ์จากฝั่ง Google:{" "}
            <a href="https://myaccount.google.com/connections">บัญชี Google → การเชื่อมต่อกับแอปและบริการของบุคคลที่สาม</a> → เลือก{" "}
            {SITE_NAME} → ลบการเชื่อมต่อ
          </li>
        </ol>
        <h2 className="wiki-h2">ลบบัญชีและข้อมูลทั้งหมด</h2>
        <p>
          ส่งอีเมลจากอีเมลที่ใช้สมัครมาที่ <a href={`mailto:${email}?subject=ขอลบบัญชี ${SITE_NAME}`}>{email}</a> หัวข้อ
          &ldquo;ขอลบบัญชี&rdquo; เราจะลบบัญชี รายการที่ติดตาม เงื่อนไขแจ้งเตือน และข้อมูลที่ได้รับจาก Google ภายใน 30 วัน
          และแจ้งยืนยันกลับทางอีเมล
        </p>
      </div>
    </Panel>
  );
}
