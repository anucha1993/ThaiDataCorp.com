import type { Metadata } from "next";
import Link from "next/link";
import Panel from "@/components/Panel";
import { getSupportEmail } from "@/lib/settings";

export const metadata: Metadata = { title: "ได้รับคำร้องแล้ว", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ ticket?: string }> };

export default async function SentPage({ searchParams }: Props) {
  const ticket = (await searchParams).ticket?.replace(/[^A-Z0-9-]/gi, "").slice(0, 20) ?? "";
  const email = await getSupportEmail();
  return (
    <Panel title="ได้รับคำร้องของคุณแล้ว" crumbs={[{ label: "ติดต่อเรา", href: "/contact" }, { label: "ส่งแล้ว" }]}>
      <div className="max-w-2xl space-y-4 text-sm leading-7">
        <div className="border border-green-700 bg-green-50 px-4 py-3">
          เลขที่คำร้อง <b className="font-mono text-lg">{ticket}</b>
          <p className="text-xs text-wiki-muted">โปรดเก็บเลขนี้ไว้สำหรับติดตามสถานะ</p>
        </div>
        <p>
          เราจะตรวจสอบและติดต่อกลับทางอีเมลภายใน 3 วันทำการ — คำขอลบข้อมูลส่วนบุคคลดำเนินการภายใน 30 วัน
          และคำขอเพิ่มข้อมูลติดต่อจะเผยแพร่หลังตรวจสอบกับเจ้าของกิจการแล้ว
        </p>
        <p>
          <Link href={`/contact/status?ticket=${encodeURIComponent(ticket)}`}>ติดตามสถานะคำร้อง</Link> ·{" "}
          <Link href="/">กลับหน้าแรก</Link> · สอบถามเพิ่มเติม <a href={`mailto:${email}?subject=${encodeURIComponent(ticket)}`}>{email}</a>
        </p>
      </div>
    </Panel>
  );
}
