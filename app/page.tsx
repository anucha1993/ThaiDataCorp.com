import Link from "next/link";
import { GuestOnly, MemberOnly } from "@/components/MemberGate";
import { isMockMode, listMockProfiles, listRecentCompanies } from "@/lib/api";
import { isBillingEnabled } from "@/lib/billing";
import { formatBaht, formatJuristicId, formatThaiDate, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/format";

export const revalidate = 86400;

export default async function HomePage() {
  const samples = listMockProfiles();
  const [recent, billing] = await Promise.all([listRecentCompanies(20), isBillingEnabled()]);

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "th-TH",
    // Sitelinks search box ใน Google
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c") }}
      />
      <article className="border border-wiki-border-light bg-white px-4 py-6 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[2rem]">ยินดีต้อนรับสู่ {SITE_NAME}</h1>
        <p className="mt-3 leading-7">
          <b>{SITE_NAME}</b> คือ{SITE_TAGLINE} รวบรวมข้อมูลสาธารณะของนิติบุคคลที่จดทะเบียนกับกรมพัฒนาธุรกิจการค้า
          ได้แก่ เลขทะเบียนนิติบุคคล ทุนจดทะเบียน สถานะกิจการ ประเภทธุรกิจ (TSIC) ที่ตั้งสำนักงานใหญ่ และสัญญาจัดซื้อจัดจ้างภาครัฐ
          ค้นหาได้จากช่องค้นหาด้านบนด้วยชื่อบริษัทหรือเลขทะเบียน 13 หลัก ดู <Link href="/new">บริษัทเปิดใหม่รายเดือน</Link> หรือ{" "}
          <Link href="/tsic">เรียกดูตามประเภทธุรกิจ (TSIC)</Link> นอกจากนี้ยังมีข้อมูล{" "}
          <Link href="/procurement">บริษัทที่ได้งานภาครัฐมากที่สุด</Link> และ{" "}
          <Link href="/agency">หน่วยงานรัฐที่จัดซื้อจัดจ้างมากที่สุด</Link> จากระบบ e-GP
        </p>
        {!billing && (
          <GuestOnly>
            <p className="mt-3 border-l-4 border-wiki-link bg-wiki-bg px-3 py-2 text-sm">
              ใช้งานฟรีทั้งหมด — <Link href="/register">สมัครสมาชิกฟรี</Link> เพื่อติดตามบริษัทและหน่วยงานรัฐ รับอีเมลแจ้งเตือน
              และดาวน์โหลดรายชื่อบริษัทเปิดใหม่เป็น CSV
            </p>
          </GuestOnly>
        )}
        <MemberOnly>
          <div className="mt-3 border-l-4 border-green-700 bg-wiki-bg px-3 py-2 text-sm">
            <b>เครื่องมือสมาชิก</b>
            <ul className="mt-1 list-disc pl-5">
              <li>
                <Link href="/search">ค้นหาขั้นสูง</Link> — กรองตามประเภทธุรกิจ จังหวัด สถานะ วันจดทะเบียน ทุน และบริษัทที่เคยได้งานภาครัฐ
                แล้วดาวน์โหลดผลเป็น CSV
              </li>
              <li>
                <Link href="/new">กรองบริษัทเปิดใหม่</Link> ตามเดือน จังหวัด และประเภทธุรกิจ แล้ว<b>ดาวน์โหลด CSV</b>
              </li>
              <li>
                กดปุ่ม &ldquo;ติดตาม&rdquo; ในหน้าบริษัทหรือ<Link href="/agency">หน่วยงานรัฐ</Link> เพื่อรับอีเมลเมื่อมีสัญญาภาครัฐใหม่
              </li>
              <li>
                ดาวน์โหลดสัญญาจัดซื้อจัดจ้างเป็น CSV ได้ในหน้าบริษัทและหน้าหน่วยงาน · ตั้งค่าแจ้งเตือนที่{" "}
                <Link href="/account">บัญชีของฉัน</Link>
              </li>
            </ul>
          </div>
        </MemberOnly>

        {recent.length > 0 && (
          <section aria-labelledby="recent-h">
            <h2 id="recent-h" className="wiki-h2">
              นิติบุคคลจดทะเบียนใหม่ล่าสุด{" "}
              <Link href="/new" className="text-base">
                (ดูทั้งหมดรายเดือน)
              </Link>
            </h2>
            <div className="overflow-x-auto">
              <table className="wikitable">
                <thead>
                  <tr>
                    <th scope="col">ชื่อนิติบุคคล</th>
                    <th scope="col">เลขทะเบียน</th>
                    <th scope="col">วันจดทะเบียน</th>
                    <th scope="col">ทุนจดทะเบียน</th>
                    <th scope="col">จังหวัด</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/company/${p.id}`}>{p.nameTh}</Link>
                      </td>
                      <td className="font-mono whitespace-nowrap tabular-nums">{p.id}</td>
                      <td className="whitespace-nowrap">{formatThaiDate(p.registerDate)}</td>
                      <td className="text-right whitespace-nowrap tabular-nums">{formatBaht(p.registerCapital)}</td>
                      <td>{p.address.province ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {isMockMode() && samples.length > 0 && (
          <section aria-labelledby="samples-h">
            <h2 id="samples-h" className="wiki-h2">
              ตัวอย่างหน้านิติบุคคล (Mock Data)
            </h2>
            <ul className="list-disc space-y-1 pl-6">
              {samples.map((p) => (
                <li key={p.id}>
                  <Link href={`/company/${p.id}`}>{p.nameTh}</Link>{" "}
                  <span className="font-mono text-sm text-wiki-muted">({formatJuristicId(p.id)})</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}
