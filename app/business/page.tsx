import type { Metadata } from "next";
import Link from "next/link";
import Panel, { Notice, primaryButtonCls } from "@/components/Panel";
import { getCurrentUser } from "@/lib/auth";
import { listMyClaims, listMyCompanies, quotas } from "@/lib/business";
import { formatThaiDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "บัญชีบริษัท — โปรโมทธุรกิจ ลงประกาศงาน และข่าวสารฟรี",
  description:
    "ยืนยันตัวตนบริษัทของคุณบน ThaiDataCorp เพื่อแก้ไขข้อมูลติดต่อ อธิบายธุรกิจ ลงประกาศรับสมัครงาน และโพสต์ข่าวสารบนหน้าบริษัท ฟรี",
  alternates: { canonical: "/business" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอตรวจสอบเอกสาร", cls: "border-amber-700 text-amber-800" },
  approved: { label: "อนุมัติแล้ว", cls: "border-green-700 text-green-800" },
  rejected: { label: "ไม่อนุมัติ", cls: "border-red-700 text-red-800" },
};

export default async function BusinessPage({ searchParams }: Props) {
  const q = await searchParams;
  const user = await getCurrentUser();
  const [companies, claims, quota] = user ? await Promise.all([listMyCompanies(user.id), listMyClaims(user.id), quotas()]) : [[], [], await quotas()];

  return (
    <Panel title="บัญชีบริษัท" crumbs={[{ label: "บัญชีบริษัท" }]}>
      {one(q.ok) === "claimed" && (
        <Notice tone="ok">ส่งคำขอและเอกสารแล้ว ผู้ดูแลจะตรวจสอบภายใน 3 วันทำการ และแจ้งผลทางอีเมล — เอกสารจะถูกลบทันทีหลังพิจารณา</Notice>
      )}
      {one(q.error) === "not-member" && <Notice tone="error">คุณยังไม่ได้รับสิทธิ์ดูแลบริษัทนี้</Notice>}

      {companies.length > 0 && (
        <section className="mb-6">
          <h2 className="wiki-h2 mt-0!">บริษัทของฉัน</h2>
          <ul className="space-y-2">
            {companies.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 border border-wiki-border-light px-3 py-2">
                <span className="text-green-800">✔</span>
                <b className="flex-1">{c.name ?? c.id}</b>
                <Link href={`/business/${c.id}`} className={primaryButtonCls}>
                  จัดการ
                </Link>
                <Link href={`/company/${c.id}`}>ดูหน้าบริษัท</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="text-sm leading-7">
          <h2 className="wiki-h2 mt-0!">บัญชีบริษัททำอะไรได้บ้าง (ฟรี)</h2>
          <ul className="list-disc pl-6">
            <li>แก้ไข/เพิ่ม <b>ข้อมูลติดต่อ</b> — เบอร์โทร อีเมล เว็บไซต์ LINE Facebook</li>
            <li>
              เขียน<b>แนะนำธุรกิจ</b> สินค้าและบริการ พร้อมโลโก้ แสดงบนหน้าบริษัท พร้อมป้าย <span className="text-green-800">✔ ยืนยันตัวตนแล้ว</span>
            </li>
            <li>
              <b>ลงประกาศรับสมัครงาน</b> {quota.jobs} ประกาศ/เดือน — แสดงบนหน้าบริษัทและหน้า <Link href="/jobs">หางาน</Link>
            </li>
            <li>
              <b>โพสต์ข่าวสาร</b> {quota.news} โพสต์/เดือน — แสดงบนหน้าบริษัทและหน้า <Link href="/news">ข่าวบริษัท</Link>
            </li>
          </ul>
          <p className="mt-2 text-xs text-wiki-muted">
            ข้อมูลทะเบียนจากกรมพัฒนาธุรกิจการค้า (ชื่อ ทุน สถานะ ที่อยู่ กรรมการ) แก้ไขผ่านบัญชีบริษัทไม่ได้ ต้องแก้ที่กรมพัฒนาธุรกิจการค้า
          </p>

          <h2 className="wiki-h2">การยืนยันตัวตน</h2>
          <p>เพื่อป้องกันการแอบอ้าง ทุกบริษัทต้องยื่นเอกสารให้ผู้ดูแลตรวจก่อนใช้งาน:</p>
          <ol className="list-decimal pl-6">
            <li>
              <b>หนังสือรับรองนิติบุคคล</b> อายุไม่เกิน 6 เดือน (แนะนำแบบอิเล็กทรอนิกส์จาก{" "}
              <a href="https://www.dbd.go.th" target="_blank" rel="noopener">
                DBD
              </a>
              )
            </li>
            <li>
              <b>สำเนาบัตรประชาชนกรรมการผู้มีอำนาจ</b> หรือ <b>หนังสือมอบอำนาจ</b> พร้อมสำเนาบัตรของผู้รับมอบอำนาจ — กรุณาเขียนกำกับ
              &ldquo;ใช้ยืนยันตัวตนกับ ThaiDataCorp เท่านั้น&rdquo; และปิดข้อมูลที่ไม่จำเป็น
            </li>
          </ol>
          <p className="mt-2">
            เอกสารใช้เพื่อยืนยันตัวตนเท่านั้น <b>ลบทิ้งทันทีหลังพิจารณา</b> (เก็บเพียงผลการอนุมัติ) — ดู{" "}
            <Link href="/terms#business">เงื่อนไขบัญชีบริษัทและการลงประกาศ</Link>
          </p>
        </div>

        <aside className="self-start border border-wiki-border bg-wiki-bg p-4 text-sm">
          <h2 className="mb-2 font-bold">เริ่มต้นใช้งาน</h2>
          {user ? (
            <>
              <p className="mb-3">ค้นหาบริษัทของคุณ แล้วกด &ldquo;ยืนยันว่าเป็นเจ้าของ&rdquo; บนหน้าบริษัท หรือกรอกเลขทะเบียนนิติบุคคลที่นี่</p>
              <form action="/business/claim" method="get" className="flex gap-2">
                <input name="id" inputMode="numeric" required placeholder="เลขทะเบียน 13 หลัก" className="min-w-0 flex-1 border border-wiki-border bg-white px-2 py-1" />
                <button type="submit" className={primaryButtonCls}>
                  ถัดไป
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mb-3">เข้าสู่ระบบหรือสมัครสมาชิก (ฟรี) ก่อน แล้วยื่นเอกสารยืนยันบริษัท</p>
              <Link href="/register?next=/business" className={primaryButtonCls}>
                สมัครสมาชิกฟรี
              </Link>
              <p className="mt-2">
                มีบัญชีแล้ว? <Link href="/login?next=/business">เข้าสู่ระบบ</Link>
              </p>
            </>
          )}
        </aside>
      </section>

      {claims.length > 0 && (
        <section>
          <h2 className="wiki-h2">คำขอของฉัน</h2>
          <table className="wikitable">
            <thead>
              <tr>
                <th scope="col">บริษัท</th>
                <th scope="col">ยื่นเมื่อ</th>
                <th scope="col">สถานะ</th>
                <th scope="col">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/company/${c.juristicId}`}>{c.companyName ?? c.juristicId}</Link>
                  </td>
                  <td className="whitespace-nowrap">{formatThaiDate(c.createdAt.slice(0, 10))}</td>
                  <td>
                    <span className={`border px-1.5 text-xs ${STATUS[c.status]?.cls}`}>{STATUS[c.status]?.label}</span>
                  </td>
                  <td className="text-sm">{c.status === "rejected" ? (c.adminNote ?? "-") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </Panel>
  );
}
