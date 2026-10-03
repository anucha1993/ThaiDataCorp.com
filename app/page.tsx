import Link from "next/link";
import { MonthlyBars, PortalGlobe, RankBars, ShareBar } from "@/components/HomeCharts";
import { GuestOnly, MemberOnly } from "@/components/MemberGate";
import { getProvider, isMockMode, listMockProfiles, listRecentCompanies } from "@/lib/api";
import { isBillingEnabled } from "@/lib/billing";
import { formatBaht, formatJuristicId, formatNumber, formatThaiDate, SITE_NAME, SITE_TAGLINE, SITE_URL, tsicUrl } from "@/lib/format";
import { getHomeStats, type HomeStats } from "@/lib/home-stats";

export const revalidate = 86400;

/** 1,234,567,890,123 → "1.23 ล้านล้าน" */
function compactBaht(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} ล้านล้าน`;
  if (n >= 1e9) return `${formatNumber(Math.round(n / 1e6))} ล้าน`;
  return `${formatNumber(Math.round(n / 1e6))} ล้าน`;
}

function Card({ title, more, children, className = "" }: { title: string; more?: { href: string; label: string }; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-wiki-border-light bg-white ${className}`}>
      <h2 className="flex items-baseline justify-between gap-2 border-b border-wiki-border-light bg-wiki-bg px-3 py-1.5 font-sans text-sm font-bold">
        {title}
        {more && (
          <Link href={more.href} className="text-xs font-normal">
            {more.label} →
          </Link>
        )}
      </h2>
      <div className="p-3">{children}</div>
    </section>
  );
}

export default async function HomePage() {
  const db = getProvider() === "db";
  const [recent, billing, stats] = await Promise.all([
    listRecentCompanies(10),
    isBillingEnabled(),
    db ? getHomeStats().catch((e) => (console.error("[home] stats failed:", e), null)) : Promise.resolve(null),
  ]);

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c") }} />

      {/* ------------------------------------------------------------------ Hero */}
      <section className="hero-classic text-wiki-text">
        <div className="relative grid gap-8 px-5 py-8 sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <div className="flex items-center gap-3">
              <PortalGlobe className="h-16 w-16 shrink-0 sm:h-[4.5rem] sm:w-[4.5rem]" />
              <div>
                <p className="font-serif text-2xl sm:text-[1.75rem]">
                  Thai<span className="font-bold">Data</span>Corp
                </p>
                <p className="text-sm text-wiki-muted">{SITE_TAGLINE}</p>
              </div>
            </div>
            <h1 className="mt-6 font-serif text-3xl leading-tight sm:text-[2.5rem]">
              ข้อมูลบริษัทไทยและงานภาครัฐ
              <br />
              <span className="text-wiki-muted">ค้นหาได้ในที่เดียว</span>
            </h1>
            <p className="mt-3 max-w-xl text-[#3a3d40]">
              ตรวจสอบนิติบุคคล ทุนจดทะเบียน ประเภทธุรกิจ และสัญญาจัดซื้อจัดจ้างภาครัฐ จากข้อมูลเปิดของหน่วยงานรัฐ
            </p>

            <form action="/search" method="get" role="search" className="mt-6 flex max-w-xl border border-wiki-border focus-within:border-wiki-text">
              <label htmlFor="home-q" className="sr-only">
                ค้นหาบริษัท
              </label>
              <input
                id="home-q"
                name="q"
                type="search"
                placeholder="ชื่อบริษัท หรือเลขทะเบียน 13 หลัก"
                autoComplete="off"
                enterKeyHint="search"
                className="min-w-0 flex-1 bg-white px-4 py-3 text-base text-wiki-text outline-none"
              />
              <button type="submit" className="classic-btn px-6 font-bold">
                ค้นหา
              </button>
            </form>
            <nav aria-label="เมนูหลัก" className="mt-4 flex flex-wrap gap-2 text-sm">
              {[
                ["/new", "บริษัทเปิดใหม่"],
                ["/tsic", "ประเภทธุรกิจ"],
                ["/procurement", "ผู้รับงานภาครัฐ"],
                ["/procurement/contracts", "สัญญาภาครัฐ"],
                ["/agency", "หน่วยงานรัฐ"],
                ["/jobs", "หางาน"],
                ["/news", "ข่าวบริษัท"],
                ["/search", "ค้นหาขั้นสูง"],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="classic-chip px-3 py-1 text-wiki-text! visited:text-wiki-text! hover:no-underline"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {stats && <KpiGrid stats={stats} />}
        </div>
      </section>

      {/* ---------------------------------------------------------- สมาชิก */}
      {!billing && (
        <GuestOnly>
          <p className="mt-4 border-l-4 border-wiki-link bg-white px-4 py-3 text-sm">
            ใช้งานฟรีทั้งหมด — <Link href="/register">สมัครสมาชิกฟรี</Link> เพื่อค้นหาขั้นสูง กรองและดาวน์โหลดข้อมูลเป็น CSV
            ติดตามบริษัทและหน่วยงานรัฐ และรับอีเมลแจ้งเตือน
          </p>
        </GuestOnly>
      )}
      <MemberOnly>
        <div className="mt-4 border-l-4 border-green-700 bg-white px-4 py-3 text-sm">
          <b>เครื่องมือสมาชิก</b> — <Link href="/search">ค้นหาขั้นสูง</Link> · <Link href="/new">กรองบริษัทเปิดใหม่</Link> ·{" "}
          <Link href="/procurement/contracts">ค้นหาสัญญาภาครัฐ</Link> · <Link href="/procurement/winners">ผู้รับงานภาครัฐ</Link> ·{" "}
          <Link href="/agency/search">หน่วยงานรัฐ</Link> — ทุกหน้ากรองและ<b>ดาวน์โหลด CSV</b> ได้ · ตั้งค่าแจ้งเตือนที่{" "}
          <Link href="/account">บัญชีของฉัน</Link>
        </div>
      </MemberOnly>

      {/* ---------------------------------------------------------- Analytics */}
      {stats && <Analytics stats={stats} />}

      {/* ------------------------------------------------------ จดทะเบียนล่าสุด */}
      <article className="mt-4 border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        {recent.length > 0 && (
          <section aria-labelledby="recent-h">
            <h2 id="recent-h" className="wiki-h2 mt-0!">
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

        {isMockMode() && (
          <section aria-labelledby="samples-h">
            <h2 id="samples-h" className="wiki-h2">
              ตัวอย่างหน้านิติบุคคล (Mock Data)
            </h2>
            <ul className="list-disc space-y-1 pl-6">
              {listMockProfiles().map((p) => (
                <li key={p.id}>
                  <Link href={`/company/${p.id}`}>{p.nameTh}</Link>{" "}
                  <span className="font-mono text-sm text-wiki-muted">({formatJuristicId(p.id)})</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h2 className="wiki-h2">เกี่ยวกับ {SITE_NAME}</h2>
        <p className="text-sm leading-7">
          <b>{SITE_NAME}</b> คือ{SITE_TAGLINE} รวบรวมข้อมูลสาธารณะของนิติบุคคลที่จดทะเบียนกับกรมพัฒนาธุรกิจการค้า ได้แก่
          เลขทะเบียนนิติบุคคล ทุนจดทะเบียน สถานะกิจการ ประเภทธุรกิจ (TSIC) ที่ตั้งสำนักงานใหญ่ และสัญญาจัดซื้อจัดจ้างภาครัฐจากระบบ e-GP
          ค้นหาได้ด้วยชื่อบริษัทหรือเลขทะเบียน 13 หลัก ดู <Link href="/new">บริษัทเปิดใหม่รายเดือน</Link>{" "}
          <Link href="/tsic">ประเภทธุรกิจ (TSIC)</Link> <Link href="/procurement">บริษัทที่ได้งานภาครัฐมากที่สุด</Link> และ{" "}
          <Link href="/agency">หน่วยงานรัฐที่จัดซื้อจัดจ้างมากที่สุด</Link>
        </p>
      </article>
    </main>
  );
}

/** การ์ดตัวเลขสำคัญ (ขวาของ hero) */
function KpiGrid({ stats: s }: { stats: HomeStats }) {
  const items = [
    { href: "/search", value: formatNumber(s.juristic), label: "นิติบุคคลในฐานข้อมูล" },
    { href: "/search?status=active", value: formatNumber(s.active), label: "ยังดำเนินกิจการ" },
    s.latestMonth && {
      href: `/new/${s.latestMonth.ym}`,
      value: formatNumber(s.latestMonth.count),
      label: `เปิดใหม่ ${s.latestMonth.label}`,
    },
    { href: "/tsic", value: formatNumber(s.tsicCodes), label: "ประเภทธุรกิจ (TSIC)" },
    { href: "/procurement/contracts", value: formatNumber(s.contracts), label: "สัญญาภาครัฐ ปีงบ 2568" },
    { href: "/procurement", value: `฿${compactBaht(s.contractValue)}`, label: "มูลค่าสัญญารวม" },
    { href: "/procurement/winners", value: formatNumber(s.winners), label: "บริษัทที่ได้งานภาครัฐ" },
    { href: "/agency", value: formatNumber(s.agencies), label: "หน่วยงานรัฐผู้ว่าจ้าง" },
  ].filter(Boolean) as Array<{ href: string; value: string; label: string }>;
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((x) => (
        <Link
          key={x.href}
          href={x.href}
          className="classic-card px-4 py-3 text-wiki-text! visited:text-wiki-text! hover:no-underline"
        >
          <span className="block font-serif text-2xl tabular-nums sm:text-[1.7rem]">{x.value}</span>
          <span className="block text-xs text-wiki-muted sm:text-sm">{x.label}</span>
        </Link>
      ))}
    </div>
  );
}

/** ภาพรวมข้อมูลแบบ classic — กราฟแท่ง + อันดับ */
function Analytics({ stats: s }: { stats: HomeStats }) {
  const first = s.months[0];
  const last = s.months[s.months.length - 1];
  const prev = s.months[s.months.length - 2];
  const change = last && prev && prev.count > 0 ? ((last.count - prev.count) / prev.count) * 100 : null;
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card title="นิติบุคคลจดทะเบียนใหม่รายเดือน" more={{ href: "/new", label: "ทุกเดือน" }} className="lg:col-span-2">
        <MonthlyBars data={s.months} />
        <p className="mt-1 text-xs text-wiki-muted">
          {first && last && `${first.label} – ${last.label}`} · กดแท่งเพื่อดูรายชื่อเดือนนั้น
        </p>
      </Card>

      <Card title="ตัวเลขสำคัญ 12 เดือนล่าสุด">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-wiki-muted">จดทะเบียนใหม่</dt>
            <dd className="font-serif text-2xl">{formatNumber(s.lastYearTotal)} ราย</dd>
          </div>
          {last && (
            <div>
              <dt className="text-wiki-muted">เดือนล่าสุด ({last.label})</dt>
              <dd className="font-serif text-2xl">
                {formatNumber(last.count)}{" "}
                {change !== null && (
                  <span className={`font-sans text-sm ${change >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% จากเดือนก่อน
                  </span>
                )}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-wiki-muted">ทุนจดทะเบียนเฉลี่ย</dt>
            <dd className="font-serif text-2xl">{formatBaht(Math.round(s.avgCapital))}</dd>
          </div>
          <div>
            <dt className="mb-1 text-wiki-muted">ประเภทนิติบุคคล</dt>
            <dd>
              <ShareBar parts={s.types.slice(0, 4).map((t) => ({ label: t.name, value: t.count }))} />
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="จังหวัดที่เปิดบริษัทใหม่มากที่สุด (12 เดือน)" more={{ href: "/new", label: "ดูรายเดือน" }}>
        <RankBars rows={s.topProvinces.map((p) => ({ label: p.name, value: p.count, href: `/search?province=${encodeURIComponent(p.name)}` }))} unit="ราย" />
      </Card>

      <Card title="ธุรกิจที่เปิดใหม่มากที่สุด (12 เดือน)" more={{ href: "/tsic", label: "ทุกประเภท" }}>
        <RankBars rows={s.topTsic.map((t) => ({ label: t.name, value: t.count, href: tsicUrl(t.code) }))} unit="ราย" />
      </Card>

      <Card title="มูลค่างานภาครัฐตามจังหวัด (ปีงบ 2568)" more={{ href: "/procurement", label: "อันดับผู้รับงาน" }}>
        <RankBars
          rows={s.procurementProvinces.map((p) => ({ label: p.name, value: p.value, href: `/procurement/${encodeURIComponent(p.name)}` }))}
          format={(n) => `฿${compactBaht(n)}`}
        />
      </Card>
    </div>
  );
}
