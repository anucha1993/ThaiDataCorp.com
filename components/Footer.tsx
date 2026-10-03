import Link from "next/link";
import { SITE_NAME } from "@/lib/format";
import { getSupportEmail } from "@/lib/settings";

export default async function Footer() {
  const year = new Date().getFullYear();
  const email = await getSupportEmail().catch(() => "info@thaidatacorp.com");

  return (
    <footer className="mt-12 border-t border-wiki-border bg-white">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 text-xs leading-relaxed text-wiki-muted">
        <p>
          <strong className="text-wiki-text">ข้อจำกัดความรับผิดชอบ:</strong> ข้อมูลในเว็บไซต์นี้เป็นข้อมูลสาธารณะที่รวบรวมจาก
          ระบบแลกเปลี่ยนข้อมูลภาครัฐ (GDX) และข้อมูลเปิดของกรมพัฒนาธุรกิจการค้า กระทรวงพาณิชย์ เพื่อประโยชน์ในการศึกษาและอ้างอิงเบื้องต้นเท่านั้น
          ข้อมูลอาจไม่เป็นปัจจุบันหรือคลาดเคลื่อน {SITE_NAME} ไม่รับรองความถูกต้องครบถ้วน และไม่รับผิดชอบต่อความเสียหายใด ๆ
          ที่เกิดจากการนำข้อมูลไปใช้ หากต้องการใช้เป็นหลักฐานทางกฎหมาย โปรดขอหนังสือรับรองจาก{" "}
          <a href="https://www.dbd.go.th" rel="noopener" target="_blank">
            กรมพัฒนาธุรกิจการค้า
          </a>{" "}
          โดยตรง
        </p>
        <p>
          ข้อมูลส่วนบุคคลแสดงเท่าที่เปิดเผยต่อสาธารณะตามกฎหมาย หากต้องการแจ้งแก้ไข ขอลบข้อมูลตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล
          พ.ศ. 2562 แจ้งปัญหา หรือร้องเรียน โปรด<Link href="/contact">ส่งคำร้องออนไลน์</Link> หรืออีเมล{" "}
          <a href={`mailto:${email}`}>{email}</a>
        </p>
        <nav aria-label="ลิงก์ส่วนท้าย" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/">หน้าหลัก</Link>
          <Link href="/search">ค้นหา</Link>
          <Link href="/new">บริษัทเปิดใหม่</Link>
          <Link href="/tsic">ประเภทธุรกิจ</Link>
          <Link href="/procurement">ผู้รับงานภาครัฐ</Link>
          <Link href="/agency">หน่วยงานรัฐ</Link>
          <Link href="/pricing">สมาชิก</Link>
          <Link href="/terms">เงื่อนไขการใช้งาน</Link>
          <Link href="/contact">ติดต่อเรา / แจ้งปัญหา</Link>
          <a href="https://data.go.th" rel="noopener" target="_blank">
            data.go.th
          </a>
          <a href="https://api.egov.go.th" rel="noopener" target="_blank">
            GDX
          </a>
        </nav>
        <p>© {year} ThaiDataCorp.com สงวนลิขสิทธิ์ในการจัดเรียงและนำเสนอข้อมูล</p>
      </div>
    </footer>
  );
}
