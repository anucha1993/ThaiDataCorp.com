import { redirect } from "next/navigation";
import { adminCancel, adminMarkPaid } from "@/app/actions";
import AdminCard from "@/components/AdminCard";
import { Notice } from "@/components/Panel";
import { listOrdersForAdmin } from "@/lib/account-repo";
import { requireUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";

type Props = { searchParams: Promise<{ ok?: string }> };

/** เข้าได้เฉพาะอีเมลใน ADMIN_EMAILS (คั่นด้วย ,) */
export default async function AdminPage({ searchParams }: Props) {
  const user = await requireUser("/admin");
  if (!user.isAdmin) redirect("/account");
  const [orders, q] = await Promise.all([listOrdersForAdmin(), searchParams]);
  const waiting = orders.filter((o) => o.status === "submitted").length;

  return (
    <AdminCard title="คำสั่งซื้อ">
      {q.ok === "paid" && <Notice tone="ok">ยืนยันรับชำระและเปิดใช้แพ็กเกจแล้ว</Notice>}
      {q.ok === "cancelled" && <Notice>ยกเลิกคำสั่งซื้อแล้ว</Notice>}
      <p className="mb-3 text-sm">
        รอตรวจสอบ <b>{waiting}</b> รายการ — ตรวจยอดเงินเข้าในบัญชีธนาคาร (ยอดและเวลาตรงกับที่ลูกค้าแจ้ง) ก่อนกดยืนยัน
      </p>
      <div className="overflow-x-auto">
        <table className="wikitable">
          <thead>
            <tr>
              <th scope="col">รหัส</th>
              <th scope="col">อีเมล</th>
              <th scope="col">แพ็กเกจ</th>
              <th scope="col">ยอด</th>
              <th scope="col">ข้อมูลการโอน</th>
              <th scope="col">สถานะ</th>
              <th scope="col">สร้างเมื่อ</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className={o.status === "submitted" ? "bg-amber-50" : undefined}>
                <td className="font-mono">{o.ref}</td>
                <td>{o.email}</td>
                <td>
                  {o.plan} × {o.months}
                </td>
                <td className="text-right tabular-nums">{formatNumber(o.amount)}</td>
                <td className="max-w-[16rem] text-sm">{o.payerNote ?? "-"}</td>
                <td>{o.status}</td>
                <td className="text-sm whitespace-nowrap">{o.createdAt.slice(0, 16)}</td>
                <td className="whitespace-nowrap">
                  {o.status !== "paid" && o.status !== "cancelled" && (
                    <div className="flex gap-2">
                      <form action={adminMarkPaid}>
                        <input type="hidden" name="id" value={o.id} />
                        <button type="submit" className="text-sm font-bold text-green-800 hover:underline">
                          ยืนยันรับเงิน
                        </button>
                      </form>
                      <form action={adminCancel}>
                        <input type="hidden" name="id" value={o.id} />
                        <button type="submit" className="text-sm text-red-800 hover:underline">
                          ยกเลิก
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}
