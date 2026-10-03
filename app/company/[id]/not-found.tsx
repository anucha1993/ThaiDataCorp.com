import Link from "next/link";

export default function CompanyNotFound() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <article className="border border-wiki-border-light bg-white px-4 py-6 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem]">ไม่พบข้อมูลนิติบุคคล</h1>
        <p className="mt-4">
          ไม่พบนิติบุคคลตามเลขทะเบียนที่ระบุ หรือเลขทะเบียนไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลักที่ผ่านการตรวจสอบ checksum)
        </p>
        <p className="mt-2">
          ลอง <Link href="/search">ค้นหาอีกครั้ง</Link> หรือกลับไปที่ <Link href="/">หน้าหลัก</Link>
        </p>
      </article>
    </main>
  );
}
