import type { Metadata } from "next";
import Link from "next/link";
import Panel from "@/components/Panel";
import ContactForm from "@/app/contact/contact-form";
import { getCompany, getProvider } from "@/lib/api";
import { findJuristicById } from "@/lib/company-repo";
import { getCurrentUser } from "@/lib/auth";
import { SITE_NAME } from "@/lib/format";
import { isValidJuristicId } from "@/lib/juristic-id";
import { getSupportEmail } from "@/lib/settings";
import { isRequestType, RELATIONS, REQUEST_TYPES } from "@/lib/support";

export const metadata: Metadata = {
  title: "ติดต่อเรา / แจ้งแก้ไขข้อมูล / ร้องเรียน",
  description: `ช่องทางติดต่อ ${SITE_NAME} แจ้งแก้ไขข้อมูลนิติบุคคล เพิ่มข้อมูลติดต่อของกิจการ ขอลบข้อมูลส่วนบุคคล แจ้งปัญหา และร้องเรียน`,
  alternates: { canonical: "/contact" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function ContactPage({ searchParams }: Props) {
  const q = await searchParams;
  const type = isRequestType(one(q.type)) ? one(q.type) : "correction";
  const id = one(q.id).replace(/\D/g, "");
  const [user, email] = await Promise.all([getCurrentUser().catch(() => null), getSupportEmail()]);
  const company = id && isValidJuristicId(id) && getProvider() === "db" ? await findJuristicById(id).catch(() => null) : null;
  // ไม่อยู่ในตาราง juristic (เช่น บริษัทเก่าที่ดึงจาก DBD ตอนเปิดหน้า) → ใช้ข้อมูลเดียวกับหน้าบริษัท
  const companyName = company?.nameTh ?? (id && isValidJuristicId(id) ? (await getCompany(id).catch(() => null))?.profile.nameTh : undefined);

  return (
    <Panel title="ติดต่อเรา / แจ้งเรื่อง" crumbs={[{ label: "ติดต่อเรา" }]}>
      <div className="mb-6 grid gap-4 text-sm md:grid-cols-3">
        <div className="border border-wiki-border-light p-3">
          <b>อีเมล</b>
          <p>
            <a href={`mailto:${email}`}>{email}</a>
          </p>
          <p className="mt-1 text-xs text-wiki-muted">ตอบกลับภายใน 3 วันทำการ</p>
        </div>
        <div className="border border-wiki-border-light p-3">
          <b>ขอลบข้อมูลส่วนบุคคล (PDPA)</b>
          <p className="mt-1 text-xs text-wiki-muted">ดำเนินการภายใน 30 วันนับจากได้รับคำร้อง และแจ้งผลทางอีเมล</p>
        </div>
        <div className="border border-wiki-border-light p-3">
          <b>ติดตามคำร้อง</b>
          <p className="mt-1 text-xs">
            <Link href="/contact/status">ตรวจสอบสถานะด้วยเลขที่คำร้อง →</Link>
          </p>
        </div>
      </div>

      <p className="mb-4 text-sm leading-6">
        ข้อมูลบน {SITE_NAME} มาจากแหล่งข้อมูลเปิดของภาครัฐ หากพบข้อมูลไม่ถูกต้อง โปรดแจ้งพร้อมแหล่งอ้างอิง
        สำหรับการแก้ไขข้อมูลทะเบียนนิติบุคคลที่ต้นทาง (ชื่อ ที่อยู่ ทุน กรรมการ) ต้องดำเนินการที่{" "}
        <a href="https://www.dbd.go.th" target="_blank" rel="noopener">
          กรมพัฒนาธุรกิจการค้า
        </a>{" "}
        แล้วข้อมูลบนเว็บไซต์จะอัปเดตตามรอบการซิงก์
      </p>

      <ContactForm
        types={Object.entries(REQUEST_TYPES).map(([value, t]) => ({ value, label: t.label, help: t.help, needsCompany: t.needsCompany }))}
        relations={Object.entries(RELATIONS).map(([value, label]) => ({ value, label }))}
        defaults={{
          type,
          juristicId: companyName ? id : "",
          companyName: companyName ?? "",
          pageUrl: one(q.from).startsWith("/") ? one(q.from) : companyName ? `/company/${id}` : "",
          name: "",
          email: user?.email ?? "",
        }}
        startedAt={Date.now()}
      />
    </Panel>
  );
}
