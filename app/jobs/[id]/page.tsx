import Ad from "@/components/Ad";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Paragraphs from "@/components/Paragraphs";
import { EMPLOYMENT_TYPES, getJob, getProfile } from "@/lib/business";
import { formatThaiDate, SITE_NAME, SITE_URL } from "@/lib/format";
import { salaryText } from "@/lib/job-format";
import { mediaUrl } from "@/lib/uploads";

export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

async function load(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const job = await getJob(id);
  if (!job || job.status === "hidden") return null;
  const profile = await getProfile(job.juristicId);
  if (profile?.hidden) return null;
  return { job, profile };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load((await params).id);
  if (!d) return { title: "ไม่พบประกาศ", robots: { index: false, follow: false } };
  const { job } = d;
  return {
    title: `${job.title} — ${job.companyName ?? ""} (${job.province})`,
    description: `${job.companyName ?? ""} รับสมัคร ${job.title} ${EMPLOYMENT_TYPES[job.employmentType]} จังหวัด${job.province} เงินเดือน ${salaryText(job.salaryMin, job.salaryMax, job.salaryNote)}`.slice(0, 158),
    alternates: { canonical: `/jobs/${job.id}` },
    robots: job.live ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function JobPage({ params }: Props) {
  const d = await load((await params).id);
  if (!d) notFound();
  const { job } = d;
  const logo = mediaUrl(job.companyLogo);

  // Google for Jobs — https://developers.google.com/search/docs/appearance/structured-data/job-posting
  const jsonLd = job.live && {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: [job.description, job.qualifications && `คุณสมบัติ\n${job.qualifications}`, job.benefits && `สวัสดิการ\n${job.benefits}`]
      .filter(Boolean)
      .join("\n\n")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\n/g, "<br>"),
    identifier: { "@type": "PropertyValue", name: SITE_NAME, value: String(job.id) },
    datePosted: job.createdAt.slice(0, 10),
    validThrough: `${job.validThrough}T23:59:59+07:00`,
    employmentType: job.employmentType,
    totalJobOpenings: job.positions,
    hiringOrganization: {
      "@type": "Organization",
      name: job.companyName ?? job.juristicId,
      sameAs: `${SITE_URL}/company/${job.juristicId}`,
      ...(logo && { logo: `${SITE_URL}${logo}` }),
    },
    jobLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressRegion: job.province, ...(job.location && { streetAddress: job.location }), addressCountry: "TH" },
    },
    ...((job.salaryMin !== null || job.salaryMax !== null) && {
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "THB",
        value: {
          "@type": "QuantitativeValue",
          ...(job.salaryMin !== null && { minValue: job.salaryMin }),
          ...(job.salaryMax !== null && { maxValue: job.salaryMax }),
          unitText: "MONTH",
        },
      },
    }),
    directApply: false,
  };

  const contacts = [
    job.contactPhone && ["โทร", <a key="p" href={`tel:${job.contactPhone.replace(/[^0-9+]/g, "")}`}>{job.contactPhone}</a>],
    job.contactEmail && ["อีเมล", <a key="e" href={`mailto:${job.contactEmail}?subject=${encodeURIComponent(`สมัครงาน: ${job.title}`)}`}>{job.contactEmail}</a>],
    job.contactLine && ["LINE", job.contactLine],
  ].filter(Boolean) as Array<[string, React.ReactNode]>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> › <Link href="/jobs">หางาน</Link> › {job.title}
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        {!job.live && <p className="mb-3 border border-wiki-border bg-wiki-bg px-3 py-2 text-sm font-bold">ประกาศนี้ปิดรับสมัครแล้ว</p>}
        <div className="flex gap-4 border-b border-wiki-border pb-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-16 w-16 shrink-0 border border-wiki-border-light object-contain" />
          )}
          <div>
            <h1 className="font-serif text-[1.75rem] leading-tight">{job.title}</h1>
            <p>
              <Link href={`/company/${job.juristicId}`}>{job.companyName ?? job.juristicId}</Link>{" "}
              <span className="text-xs text-green-800">✔ ยืนยันตัวตนแล้ว</span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4 text-[0.95rem] leading-7">
            {job.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(job.image)!} alt={job.title} className="max-h-[26rem] w-full border border-wiki-border-light object-contain" />
            )}
            <section>
              <h2 className="wiki-h2 mt-0!">รายละเอียดงาน</h2>
              <Paragraphs text={job.description} />
            </section>
            {job.qualifications && (
              <section>
                <h2 className="wiki-h2">คุณสมบัติ</h2>
                <Paragraphs text={job.qualifications} />
              </section>
            )}
            {job.benefits && (
              <section>
                <h2 className="wiki-h2">สวัสดิการ</h2>
                <Paragraphs text={job.benefits} />
              </section>
            )}
          </div>
          <aside className="space-y-3 self-start text-sm">
            <table className="w-full border-collapse border border-wiki-border bg-wiki-bg">
              <tbody>
                {(
                  [
                    ["ประเภทงาน", EMPLOYMENT_TYPES[job.employmentType]],
                    ["จำนวน", `${job.positions} อัตรา`],
                    ["เงินเดือน", salaryText(job.salaryMin, job.salaryMax, job.salaryNote)],
                    ["จังหวัด", job.province],
                    ["สถานที่", job.location ?? "-"],
                    ["ประกาศเมื่อ", formatThaiDate(job.createdAt.slice(0, 10))],
                    ["ปิดรับ", formatThaiDate(job.validThrough)],
                  ] as const
                ).map(([k, v]) => (
                  <tr key={k} className="border-t border-wiki-border-light">
                    <th scope="row" className="w-24 px-2 py-1.5 text-left align-top">
                      {k}
                    </th>
                    <td className="px-2 py-1.5">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {job.live && contacts.length > 0 && (
              <div className="border border-wiki-text p-3">
                <h2 className="mb-1 font-bold">สนใจสมัคร ติดต่อ{job.contactName ? ` ${job.contactName}` : "บริษัทโดยตรง"}</h2>
                <dl className="grid grid-cols-[3rem_minmax(0,1fr)] gap-y-1">
                  {contacts.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-wiki-muted">{k}</dt>
                      <dd className="truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <p className="border border-amber-300 bg-amber-50 p-3 text-xs leading-5">
              {SITE_NAME} เป็นเพียงพื้นที่ลงประกาศ ไม่ได้เป็นผู้จัดหางานหรือเป็นตัวแทนนายจ้าง ·{" "}
              <b>การสมัครงานต้องไม่มีค่าใช้จ่าย</b> หากถูกเรียกเก็บเงิน ขอสำเนาบัตร/บัญชีธนาคารก่อนสัมภาษณ์ หรือชวนไปทำงานต่างประเทศโดยไม่มีใบอนุญาต
              โปรดระวังและ{" "}
              <Link href={`/contact?type=complaint&from=${encodeURIComponent(`/jobs/${job.id}`)}&subject=${encodeURIComponent(`รายงานประกาศงาน #${job.id}`)}`}>
                รายงานประกาศนี้
              </Link>
            </p>
          </aside>
        </div>
        <Ad page="jobs" placement="content_bottom" />
      </article>
    </main>
  );
}
