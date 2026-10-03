import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { removeNewsPost, saveCompanyProfile, toggleJob } from "@/app/business/actions";
import FileGuard from "@/components/FileGuard";
import Panel, { buttonCls, inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { requireUser } from "@/lib/auth";
import { EMPLOYMENT_TYPES, getProfile, isCompanyMember, listCompanyJobs, listCompanyNews, postsThisMonth, quotas } from "@/lib/business";
import { findJuristicById } from "@/lib/company-repo";
import { getCompany } from "@/lib/api";
import { formatThaiDate } from "@/lib/format";
import { getJuristicContact } from "@/lib/support";
import { mediaUrl } from "@/lib/uploads";

export const metadata: Metadata = { title: "จัดการบัญชีบริษัท", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MSG: Record<string, { tone: "ok" | "error"; text: string }> = {
  "ok:profile": { tone: "ok", text: "บันทึกข้อมูลบริษัทแล้ว — หน้าบริษัทอัปเดตแล้ว" },
  "ok:job": { tone: "ok", text: "บันทึกประกาศงานแล้ว" },
  "ok:news": { tone: "ok", text: "บันทึกข่าวสารแล้ว" },
  "ok:news-deleted": { tone: "ok", text: "ลบข่าวสารแล้ว" },
  "error:job-quota": { tone: "error", text: "ลงประกาศงานครบโควตาเดือนนี้แล้ว" },
  "error:news-quota": { tone: "error", text: "โพสต์ข่าวสารครบโควตาเดือนนี้แล้ว" },
  "error:not-found": { tone: "error", text: "ไม่พบรายการ" },
  "error:contact-phone": { tone: "error", text: "รูปแบบเบอร์โทรไม่ถูกต้อง" },
  "error:contact-email": { tone: "error", text: "รูปแบบอีเมลไม่ถูกต้อง" },
  "error:contact-website": { tone: "error", text: "รูปแบบเว็บไซต์ไม่ถูกต้อง" },
  "error:contact-facebook": { tone: "error", text: "ลิงก์ Facebook ต้องเป็น facebook.com" },
  "error:contact-line": { tone: "error", text: "รูปแบบ LINE ID ไม่ถูกต้อง" },
  "error:logo-too-large": { tone: "error", text: "โลโก้ใหญ่เกิน 3MB" },
  "error:logo-bad-type": { tone: "error", text: "โลโก้ต้องเป็น JPG, PNG หรือ WebP" },
  "error:logo-bad-image": { tone: "error", text: "อ่านไฟล์รูปไม่ได้" },
};

export default async function CompanyDashboard({ params, searchParams }: Props) {
  const id = (await params).id;
  const user = await requireUser(`/business/${id}`);
  if (!(await isCompanyMember(user.id, id))) redirect("/business?error=not-member");
  const q = await searchParams;
  const msg = one(q.ok) ? MSG[`ok:${one(q.ok)}`] : one(q.error) ? MSG[`error:${one(q.error)}`] : undefined;

  const [row, profile, contact, jobs, news, quota, jobsUsed, newsUsed] = await Promise.all([
    findJuristicById(id).catch(() => null),
    getProfile(id),
    getJuristicContact(id),
    listCompanyJobs(id, false),
    listCompanyNews(id, false),
    quotas(),
    postsThisMonth("job_post", id),
    postsThisMonth("news_post", id),
  ]);
  const name = row?.nameTh ?? (await getCompany(id).catch(() => null))?.profile.nameTh ?? id;
  const logo = mediaUrl(profile?.logo);

  return (
    <Panel title={name} crumbs={[{ label: "บัญชีบริษัท", href: "/business" }, { label: name }]}>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {profile?.hidden && <Notice tone="error">ผู้ดูแลระงับการแสดงข้อมูลจากเจ้าของกิจการของบริษัทนี้ชั่วคราว — ติดต่อผู้ดูแลเว็บไซต์</Notice>}
      <p className="mb-4 text-sm">
        <span className="text-green-800">✔ ยืนยันตัวตนแล้ว</span> · <Link href={`/company/${id}`}>ดูหน้าบริษัท</Link> ·{" "}
        <Link href="/terms#business">เงื่อนไขการลงประกาศ</Link>
      </p>

      {/* ------------------------------------------------------------- โปรไฟล์ */}
      <section id="profile">
        <h2 className="wiki-h2 mt-0!">ข้อมูลบริษัท</h2>
        <form action={saveCompanyProfile} encType="multipart/form-data" className="grid max-w-4xl gap-3 text-sm sm:grid-cols-2">
          <input type="hidden" name="juristicId" value={id} />
          <label className="flex flex-col gap-1 sm:col-span-2">
            แนะนำธุรกิจ (สูงสุด 3,000 ตัวอักษร)
            <textarea name="about" rows={6} maxLength={3000} defaultValue={profile?.about ?? ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            สินค้า / บริการ (บรรทัดละรายการ)
            <textarea name="services" rows={4} maxLength={2000} defaultValue={profile?.services ?? ""} className={inputCls} />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="โลโก้ปัจจุบัน" className="h-16 w-16 border border-wiki-border-light object-contain" />
            )}
            <label className="flex flex-col gap-1">
              โลโก้ (JPG / PNG / WebP ไม่เกิน 3MB — ย่อเป็น 400px อัตโนมัติ)
              <input type="file" name="logo" data-max-mb="3" data-max-files="1" data-types="image/jpeg,image/png,image/webp" accept="image/jpeg,image/png,image/webp" />
              <FileGuard />
            </label>
            {logo && (
              <label className="flex items-center gap-1">
                <input type="checkbox" name="removeLogo" value="1" /> ลบโลโก้
              </label>
            )}
          </div>
          <h3 className="font-bold sm:col-span-2">ข้อมูลติดต่อ (แสดงบนหน้าบริษัท — เว้นว่างทุกช่องเพื่อเอาออก)</h3>
          {(
            [
              ["phone", "เบอร์โทรศัพท์", contact?.phone],
              ["email", "อีเมล", contact?.email],
              ["website", "เว็บไซต์", contact?.website],
              ["lineId", "LINE ID / LINE OA", contact?.lineId],
              ["facebook", "Facebook Page", contact?.facebook],
            ] as const
          ).map(([k, label, v]) => (
            <label key={k} className="flex flex-col gap-1">
              {label}
              <input name={k} defaultValue={v ?? ""} className={inputCls} />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button type="submit" className={primaryButtonCls}>
              บันทึกข้อมูลบริษัท
            </button>
          </div>
        </form>
      </section>

      {/* ---------------------------------------------------------- ประกาศงาน */}
      <section id="jobs">
        <h2 className="wiki-h2 flex flex-wrap items-baseline gap-3">
          ประกาศรับสมัครงาน
          <span className="text-sm text-wiki-muted">
            เดือนนี้ใช้ไป {jobsUsed}/{quota.jobs}
          </span>
          {jobsUsed < quota.jobs ? (
            <Link href={`/business/${id}/jobs/new`} className={`${primaryButtonCls} ml-auto text-sm`}>
              + ลงประกาศงาน
            </Link>
          ) : (
            <span className="ml-auto text-sm text-wiki-muted">ครบโควตาเดือนนี้แล้ว</span>
          )}
        </h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-wiki-muted">ยังไม่มีประกาศ</p>
        ) : (
          <table className="wikitable">
            <thead>
              <tr>
                <th scope="col">ตำแหน่ง</th>
                <th scope="col">ประเภท</th>
                <th scope="col">สถานะ</th>
                <th scope="col">หมดอายุ</th>
                <th scope="col">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <Link href={`/jobs/${j.id}`}>{j.title}</Link>
                  </td>
                  <td className="text-xs">{EMPLOYMENT_TYPES[j.employmentType]}</td>
                  <td className="text-xs">
                    {j.status === "hidden" ? (
                      <span className="text-red-800">ถูกระงับโดยผู้ดูแล</span>
                    ) : j.live ? (
                      <span className="text-green-800">เปิดรับ</span>
                    ) : j.status === "closed" ? (
                      "ปิดรับแล้ว"
                    ) : (
                      "หมดอายุ"
                    )}
                  </td>
                  <td className="text-xs whitespace-nowrap">{formatThaiDate(j.validThrough)}</td>
                  <td className="text-xs whitespace-nowrap">
                    {j.status !== "hidden" && (
                      <div className="flex gap-2">
                        <Link href={`/business/${id}/jobs/${j.id}`}>แก้ไข/ต่ออายุ</Link>
                        <form action={toggleJob}>
                          <input type="hidden" name="juristicId" value={id} />
                          <input type="hidden" name="jobId" value={j.id} />
                          <input type="hidden" name="open" value={j.status === "active" ? "0" : "1"} />
                          <button type="submit" className="text-wiki-link hover:underline">
                            {j.status === "active" ? "ปิดรับ" : "เปิดรับ"}
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ----------------------------------------------------------- ข่าวสาร */}
      <section id="news">
        <h2 className="wiki-h2 flex flex-wrap items-baseline gap-3">
          ข่าวสาร
          <span className="text-sm text-wiki-muted">
            เดือนนี้ใช้ไป {newsUsed}/{quota.news}
          </span>
          {newsUsed < quota.news ? (
            <Link href={`/business/${id}/news/new`} className={`${primaryButtonCls} ml-auto text-sm`}>
              + โพสต์ข่าว
            </Link>
          ) : (
            <span className="ml-auto text-sm text-wiki-muted">ครบโควตาเดือนนี้แล้ว</span>
          )}
        </h2>
        {news.length === 0 ? (
          <p className="text-sm text-wiki-muted">ยังไม่มีข่าว</p>
        ) : (
          <table className="wikitable">
            <thead>
              <tr>
                <th scope="col">หัวข้อ</th>
                <th scope="col">โพสต์เมื่อ</th>
                <th scope="col">สถานะ</th>
                <th scope="col">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {news.map((n) => (
                <tr key={n.id}>
                  <td>{n.status === "published" ? <Link href={`/news/${n.id}`}>{n.title}</Link> : n.title}</td>
                  <td className="text-xs whitespace-nowrap">{formatThaiDate(n.createdAt.slice(0, 10))}</td>
                  <td className="text-xs">{n.status === "published" ? <span className="text-green-800">เผยแพร่</span> : "ลบ/ระงับแล้ว"}</td>
                  <td className="text-xs whitespace-nowrap">
                    {n.status === "published" && (
                      <div className="flex gap-2">
                        <Link href={`/business/${id}/news/${n.id}`}>แก้ไข</Link>
                        <form action={removeNewsPost}>
                          <input type="hidden" name="juristicId" value={id} />
                          <input type="hidden" name="newsId" value={n.id} />
                          <button type="submit" className={`${buttonCls} px-2! py-0! text-xs text-red-800`}>
                            ลบ
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Panel>
  );
}
