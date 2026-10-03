import type { ReactNode } from "react";
import Link from "next/link";
import Paragraphs from "@/components/Paragraphs";
import { EMPLOYMENT_TYPES, type CompanyProfile, type JobPost, type NewsPost } from "@/lib/business";
import { formatThaiDate } from "@/lib/format";
import { salaryText } from "@/lib/job-format";
import { mediaUrl } from "@/lib/uploads";

/**
 * ส่วนที่เจ้าของกิจการ (บัญชีบริษัทที่ยืนยันแล้ว) เขียนเอง — แยกจากข้อมูลทะเบียนภาครัฐให้เห็นชัด
 */
export default function CompanyBusiness({
  profile,
  jobs,
  news,
  contact,
}: {
  profile: CompanyProfile | null;
  jobs: JobPost[];
  news: NewsPost[];
  /** กล่องข้อมูลติดต่อ — แสดงต่อจากสินค้า/บริการ */
  contact?: ReactNode;
}) {
  const logo = mediaUrl(profile?.logo);
  const services = profile?.services?.split("\n").map((s) => s.trim()).filter(Boolean) ?? [];
  const hasProfile = Boolean(profile?.about || services.length || logo);
  if (!hasProfile && jobs.length === 0 && news.length === 0 && !contact) return null;

  return (
    <>
      {(hasProfile || contact) && (
        <section id="about" aria-labelledby="about-h">
          <h2 id="about-h" className="wiki-h2 flex items-center gap-2">
            เกี่ยวกับบริษัท <span className="text-sm text-green-800">✔ ข้อมูลจากเจ้าของกิจการ</span>
          </h2>
          <div className="flex gap-4">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="โลโก้บริษัท" className="h-20 w-20 shrink-0 border border-wiki-border-light object-contain" />
            )}
            <Paragraphs text={profile?.about} className="text-[0.95rem] leading-7" />
          </div>
          {services.length > 0 && (
            <>
              <h3 className="mt-3 font-bold">สินค้า / บริการ</h3>
              <ul className="list-disc pl-6 text-[0.95rem] leading-7">
                {services.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {contact}
        </section>
      )}

      {jobs.length > 0 && (
        <section id="jobs" aria-labelledby="jobs-h">
          <h2 id="jobs-h" className="wiki-h2">
            ประกาศรับสมัครงาน <span className="text-base text-wiki-muted">({jobs.length})</span>
          </h2>
          <ul className="divide-y divide-wiki-border-light border border-wiki-border-light">
            {jobs.map((j) => (
              <li key={j.id} className="px-3 py-2">
                <Link href={`/jobs/${j.id}`} className="font-bold">
                  {j.title}
                </Link>
                <div className="flex flex-wrap gap-x-3 text-xs text-wiki-muted">
                  <span>{EMPLOYMENT_TYPES[j.employmentType]}</span>
                  <span>📍 {j.province}</span>
                  <span>💰 {salaryText(j.salaryMin, j.salaryMax, j.salaryNote)}</span>
                  <span>ปิดรับ {formatThaiDate(j.validThrough)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {news.length > 0 && (
        <section id="company-news" aria-labelledby="company-news-h">
          <h2 id="company-news-h" className="wiki-h2">
            ข่าวสารจากบริษัท
          </h2>
          <ul className="space-y-2">
            {news.map((n) => (
              <li key={n.id}>
                <Link href={`/news/${n.id}`}>{n.title}</Link>{" "}
                <span className="text-xs text-wiki-muted">{formatThaiDate(n.createdAt.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
