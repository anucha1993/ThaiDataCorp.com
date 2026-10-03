import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDecideClaim } from "@/app/admin/actions";
import AdminCard from "@/components/AdminCard";
import { buttonCls, inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { getClaim } from "@/lib/business";
import { dbdWarehouseUrl } from "@/lib/format";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };

export default async function ClaimReviewPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  const c = Number.isInteger(id) && id > 0 ? await getClaim(id) : null;
  if (!c) notFound();
  const error = (await searchParams).error;

  return (
    <AdminCard title={`คำขอยืนยันบริษัท #${c.id}`} actions={<Link href="/admin/business">← ทั้งหมด</Link>}>
      {error === "note" && <Notice tone="error">ไม่อนุมัติต้องระบุเหตุผล (ส่งให้ผู้ยื่นทางอีเมล)</Notice>}
      {error === "state" && <Notice tone="error">คำขอนี้พิจารณาไปแล้ว</Notice>}
      <table className="wikitable mb-4 max-w-3xl">
        <tbody>
          {(
            [
              ["บริษัท", <Link key="c" href={`/company/${c.juristicId}`}>{c.companyName ?? c.juristicId} ({c.juristicId})</Link>],
              ["ตรวจกับ DBD", <a key="d" href={dbdWarehouseUrl(c.juristicId)} target="_blank" rel="noopener">DBD DataWarehouse ↗ (ดูชื่อกรรมการ)</a>],
              ["ผู้ยื่น", `${c.contactName}${c.position ? ` — ${c.position}` : ""}`],
              ["บัญชี", c.userEmail ?? "-"],
              ["โทร", c.phone],
              ["ยื่นเมื่อ", c.createdAt.slice(0, 16)],
              ["สถานะ", c.status],
            ] as Array<[string, React.ReactNode]>
          ).map(([k, v]) => (
            <tr key={k}>
              <th scope="row" className="w-32 text-left!">
                {k}
              </th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-1 font-bold">เอกสาร</h3>
      {c.docsDeletedAt ? (
        <p className="mb-4 text-sm text-wiki-muted">ลบไฟล์เอกสารแล้วเมื่อ {c.docsDeletedAt.slice(0, 16)} (หลังพิจารณา)</p>
      ) : (
        <ul className="mb-4 list-disc pl-6 text-sm">
          {c.docFiles.map((f, i) => (
            <li key={f}>
              <a href={`/admin/business/doc?claim=${c.id}&f=${encodeURIComponent(f)}`} target="_blank" rel="noopener">
                {i === 0 ? "หนังสือรับรองนิติบุคคล" : `เอกสารยืนยันตัวตน ${i}`} ({f.split(".").pop()?.toUpperCase()}) ↗
              </a>
            </li>
          ))}
        </ul>
      )}

      {c.status === "pending" ? (
        <form action={adminDecideClaim} className="grid max-w-3xl gap-3 border border-wiki-border-light p-3 text-sm">
          <input type="hidden" name="id" value={c.id} />
          <p className="text-xs text-wiki-muted">
            ตรวจ: ชื่อบริษัท/เลขทะเบียนในหนังสือรับรองตรงกัน · อายุไม่เกิน 6 เดือน · ผู้ลงนามเป็นกรรมการผู้มีอำนาจ (เทียบกับ DBD) หรือมีหนังสือมอบอำนาจ ·
            พิจารณาโทรยืนยันตามเบอร์ที่ให้ไว้ — <b>เมื่อกดอนุมัติ/ไม่อนุมัติ ไฟล์เอกสารจะถูกลบทันที</b>
          </p>
          <label className="flex flex-col gap-1">
            หมายเหตุ / เหตุผล (จำเป็นเมื่อไม่อนุมัติ — ส่งให้ผู้ยื่น)
            <textarea name="note" rows={3} className={inputCls} />
          </label>
          <div className="flex gap-3">
            <button type="submit" name="decision" value="approve" className={primaryButtonCls}>
              ✓ อนุมัติ
            </button>
            <button type="submit" name="decision" value="reject" className={`${buttonCls} text-red-800`}>
              ✕ ไม่อนุมัติ
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm">
          พิจารณาแล้ว ({c.status}) เมื่อ {c.reviewedAt?.slice(0, 16)} {c.adminNote && `— ${c.adminNote}`}
        </p>
      )}
    </AdminCard>
  );
}
