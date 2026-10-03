import Link from "next/link";
import { adminCompanyAccess, adminToggleJob, adminToggleNews } from "@/app/admin/actions";
import AdminCard from "@/components/AdminCard";
import { Notice } from "@/components/Panel";
import { EMPLOYMENT_TYPES, listAllJobs, listAllNews, listClaims, listVerifiedCompanies, quotas } from "@/lib/business";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

const TABS = [
  ["claims", "คำขอยืนยัน"],
  ["companies", "บริษัทที่ยืนยันแล้ว"],
  ["jobs", "ประกาศงาน"],
  ["news", "ข่าวสาร"],
] as const;

const CLAIM_STATUS: Record<string, string> = { pending: "รอตรวจ", approved: "อนุมัติ", rejected: "ไม่อนุมัติ" };
const linkBtn = "text-wiki-link hover:underline";

export default async function AdminBusinessPage({ searchParams }: Props) {
  const q = await searchParams;
  const tab = TABS.some(([k]) => k === one(q.tab)) ? one(q.tab) : "claims";
  const quota = await quotas();

  return (
    <AdminCard title="บัญชีบริษัท">
      {one(q.ok) === "approved" && <Notice tone="ok">อนุมัติแล้ว — ลบไฟล์เอกสารแล้ว และแจ้งผู้ยื่นทางอีเมล</Notice>}
      {one(q.ok) === "rejected" && <Notice tone="ok">ไม่อนุมัติ — ลบไฟล์เอกสารแล้ว และแจ้งเหตุผลทางอีเมล</Notice>}
      <nav className="mb-3 flex flex-wrap gap-1 text-sm">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/business?tab=${k}`}
            className={`border px-3 py-1 hover:no-underline ${tab === k ? "border-wiki-text bg-wiki-text text-white!" : "border-wiki-border-light bg-white"}`}
          >
            {label}
          </Link>
        ))}
        <span className="ml-auto self-center text-xs text-wiki-muted">
          โควตาต่อบริษัท: งาน {quota.jobs} / ข่าว {quota.news} ต่อเดือน — <Link href="/admin/settings">แก้ไข</Link>
        </span>
      </nav>
      {tab === "claims" && <Claims status={one(q.status) || "pending"} />}
      {tab === "companies" && <Companies />}
      {tab === "jobs" && <Jobs />}
      {tab === "news" && <News />}
    </AdminCard>
  );
}

async function Claims({ status }: { status: string }) {
  const { rows } = await listClaims(status);
  return (
    <>
      <p className="mb-2 flex gap-3 text-sm">
        {["pending", "approved", "rejected", "all"].map((s) => (
          <Link key={s} href={`/admin/business?tab=claims&status=${s}`} className={status === s ? "font-bold" : undefined}>
            {CLAIM_STATUS[s] ?? "ทั้งหมด"}
          </Link>
        ))}
      </p>
      <table className="wikitable">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">บริษัท</th>
            <th scope="col">ผู้ยื่น</th>
            <th scope="col">สถานะ</th>
            <th scope="col">ยื่นเมื่อ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/admin/business/claims/${c.id}`}>#{c.id}</Link>
              </td>
              <td>{c.companyName ?? c.juristicId}</td>
              <td className="text-xs">
                {c.contactName} · {c.userEmail}
              </td>
              <td className="text-xs">{CLAIM_STATUS[c.status]}</td>
              <td className="text-xs whitespace-nowrap">{c.createdAt.slice(0, 16)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center text-wiki-muted">
                ไม่มีรายการ
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

async function Companies() {
  const rows = await listVerifiedCompanies();
  return (
    <table className="wikitable">
      <thead>
        <tr>
          <th scope="col">บริษัท</th>
          <th scope="col">ผู้ดูแล</th>
          <th scope="col">งาน / ข่าว</th>
          <th scope="col">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={`${c.id}-${c.userId}`} className={c.hidden ? "bg-red-50" : undefined}>
            <td>
              <Link href={`/company/${c.id}`}>{c.name ?? c.id}</Link>
              {c.hidden && <span className="ml-1 text-xs text-red-800">(ระงับการแสดง)</span>}
            </td>
            <td className="text-xs">
              {c.email} · ตั้งแต่ {c.since.slice(0, 10)}
            </td>
            <td className="text-right text-xs tabular-nums">
              {c.jobs} / {c.news}
            </td>
            <td className="text-xs whitespace-nowrap">
              <form action={adminCompanyAccess} className="inline">
                <input type="hidden" name="juristicId" value={c.id} />
                <input type="hidden" name="hidden" value={c.hidden ? "0" : "1"} />
                <button type="submit" className={linkBtn}>
                  {c.hidden ? "เลิกระงับ" : "ระงับข้อมูลบริษัท"}
                </button>
              </form>{" "}
              ·{" "}
              <form action={adminCompanyAccess} className="inline">
                <input type="hidden" name="juristicId" value={c.id} />
                <input type="hidden" name="userId" value={c.userId} />
                <button type="submit" className={`${linkBtn} text-red-800!`}>
                  ถอนสิทธิ์ผู้ดูแลคนนี้
                </button>
              </form>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={4} className="text-center text-wiki-muted">
              ยังไม่มีบริษัทที่ยืนยัน
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

async function Jobs() {
  const rows = await listAllJobs("");
  return (
    <table className="wikitable">
      <thead>
        <tr>
          <th scope="col">ตำแหน่ง</th>
          <th scope="col">บริษัท</th>
          <th scope="col">ประเภท</th>
          <th scope="col">สถานะ</th>
          <th scope="col">ลงเมื่อ</th>
          <th scope="col">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((j) => (
          <tr key={j.id} className={j.status === "hidden" ? "bg-red-50" : undefined}>
            <td>
              <Link href={`/jobs/${j.id}`}>{j.title}</Link>
            </td>
            <td className="text-xs">{j.companyName ?? j.juristicId}</td>
            <td className="text-xs">{EMPLOYMENT_TYPES[j.employmentType]}</td>
            <td className="text-xs">{j.status === "hidden" ? "ระงับ" : j.live ? "เปิดรับ" : j.status === "closed" ? "ปิดรับ" : "หมดอายุ"}</td>
            <td className="text-xs whitespace-nowrap">{j.createdAt.slice(0, 10)}</td>
            <td className="text-xs">
              <form action={adminToggleJob}>
                <input type="hidden" name="id" value={j.id} />
                <input type="hidden" name="hide" value={j.status === "hidden" ? "0" : "1"} />
                <button type="submit" className={linkBtn}>
                  {j.status === "hidden" ? "เลิกระงับ" : "ระงับประกาศ"}
                </button>
              </form>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={6} className="text-center text-wiki-muted">
              ยังไม่มีประกาศ
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

async function News() {
  const rows = await listAllNews("");
  return (
    <table className="wikitable">
      <thead>
        <tr>
          <th scope="col">หัวข้อ</th>
          <th scope="col">บริษัท</th>
          <th scope="col">สถานะ</th>
          <th scope="col">โพสต์เมื่อ</th>
          <th scope="col">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => (
          <tr key={n.id} className={n.status === "hidden" ? "bg-red-50" : undefined}>
            <td>{n.status === "published" ? <Link href={`/news/${n.id}`}>{n.title}</Link> : n.title}</td>
            <td className="text-xs">{n.companyName ?? n.juristicId}</td>
            <td className="text-xs">{n.status === "published" ? "เผยแพร่" : "ระงับ/ลบ"}</td>
            <td className="text-xs whitespace-nowrap">{n.createdAt.slice(0, 10)}</td>
            <td className="text-xs">
              <form action={adminToggleNews}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="hide" value={n.status === "hidden" ? "0" : "1"} />
                <button type="submit" className={linkBtn}>
                  {n.status === "hidden" ? "เผยแพร่อีกครั้ง" : "ระงับข่าว"}
                </button>
              </form>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={5} className="text-center text-wiki-muted">
              ยังไม่มีข่าว
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
