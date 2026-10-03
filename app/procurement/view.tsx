/** หน้าจัดอันดับผู้รับงานภาครัฐ — ใช้ร่วมกันระหว่าง /procurement และ /procurement/[province] */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import WinnerTable from "@/components/WinnerTable";
import { getProvider } from "@/lib/api";
import { formatMillionBaht, formatNumber, inProvince, procurementUrl, SITE_NAME } from "@/lib/format";
import { getTopWinners, listProcurementProvinces } from "@/lib/procurement-repo";

async function load(province?: string) {
  if (getProvider() !== "db") return null;
  const provinces = await listProcurementProvinces();
  const current = province ? provinces.find((p) => p.province === province) : null;
  if (province && !current) return null;
  const national = provinces.reduce(
    (s, p) => ({ contracts: s.contracts + p.contracts, value: s.value + p.value }),
    { contracts: 0, value: 0 },
  );
  return { provinces, current, national };
}

function scope(province?: string) {
  return province ? inProvince(province) : "ทั่วประเทศ";
}

export async function procurementMetadata(province?: string): Promise<Metadata> {
  const d = await load(province);
  if (!d) return { title: "ไม่พบข้อมูล", robots: { index: false, follow: true } };
  const stats = d.current ?? d.national;
  const title = `บริษัทที่ได้งานภาครัฐมากที่สุด${scope(province)} ปีงบประมาณ 2568`;
  return {
    title,
    description: `จัดอันดับนิติบุคคลที่ได้รับสัญญาจัดซื้อจัดจ้างภาครัฐ${scope(province)} จาก ${formatNumber(stats.contracts)} สัญญา มูลค่ารวม ${formatMillionBaht(stats.value)} ข้อมูลระบบ e-GP ปีงบประมาณ 2568`,
    alternates: { canonical: procurementUrl(province) },
  };
}

export async function ProcurementView({ province }: { province?: string }) {
  const d = await load(province);
  if (!d) notFound();
  const winners = await getTopWinners(province, 100);
  const stats = d.current ?? d.national;

  return (
    <main className="mx-auto max-w-6xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link> ›{" "}
        {province ? (
          <>
            <Link href="/procurement">ผู้รับงานภาครัฐ</Link> › {province}
          </>
        ) : (
          "ผู้รับงานภาครัฐ"
        )}
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem] leading-tight sm:text-[2rem]">
          บริษัทที่ได้งานภาครัฐมากที่สุด{province ? ` ${inProvince(province)}` : ""}
        </h1>
        <p className="mt-3 leading-7">
          ในปีงบประมาณ 2568 หน่วยงานภาครัฐทำสัญญาจัดซื้อจัดจ้างกับนิติบุคคล{province ? `สำหรับโครงการ${inProvince(province)}` : ""}{" "}
          {formatNumber(stats.contracts)} สัญญา มูลค่ารวม {formatNumber(stats.value)} บาท
          {d.current && ` กับผู้รับสัญญา ${formatNumber(d.current.winners)} ราย`}{" "}
          ตารางด้านล่างแสดง {winners.length} อันดับแรกตามมูลค่าสัญญารวม
          {!province && <> ดูเพิ่มเติม: <Link href="/agency">หน่วยงานรัฐที่จัดซื้อจัดจ้างมากที่สุด</Link></>}
        </p>

        <h2 className="wiki-h2">อันดับผู้รับสัญญา{province ? ` ${inProvince(province)}` : ""}</h2>
        <WinnerTable winners={winners} />

        <h2 className="wiki-h2">{province ? "จังหวัดอื่น" : "แยกตามจังหวัดที่ตั้งโครงการ"}</h2>
        <div className="overflow-x-auto">
          <table className="wikitable">
            <thead>
              <tr>
                <th scope="col">จังหวัด</th>
                <th scope="col">สัญญา</th>
                <th scope="col">มูลค่ารวม</th>
                <th scope="col">ผู้รับสัญญา</th>
              </tr>
            </thead>
            <tbody>
              {d.provinces.map((p) => (
                <tr key={p.province} className={p.province === province ? "font-bold" : undefined}>
                  <td>
                    <Link href={procurementUrl(p.province)}>{p.province}</Link>
                  </td>
                  <td className="text-right tabular-nums">{formatNumber(p.contracts)}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatMillionBaht(p.value)}</td>
                  <td className="text-right tabular-nums">{formatNumber(p.winners)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-wiki-muted">
          ที่มา: ระบบการจัดซื้อจัดจ้างภาครัฐ (e-GP) โดยสำนักงานพัฒนารัฐบาลดิจิทัล (data.go.th, CC-BY) — {SITE_NAME}{" "}
          นับเฉพาะสัญญาที่ผู้รับสัญญาเป็นนิติบุคคล จังหวัดหมายถึงที่ตั้งของโครงการ ไม่ใช่ที่ตั้งของบริษัท
        </p>
      </article>
    </main>
  );
}
