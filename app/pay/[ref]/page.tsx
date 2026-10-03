import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { submitPayment } from "@/app/actions";
import Panel, { inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { getOrder } from "@/lib/account-repo";
import { requireUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { getPlan } from "@/lib/plans";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "ชำระเงิน", robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * PROMPTPAY_ID = เบอร์มือถือ (10 หลัก) หรือเลขผู้เสียภาษี/เลขนิติบุคคล (13 หลัก) ที่ผูกพร้อมเพย์ไว้
 * PROMPTPAY_NAME = ชื่อบัญชีที่ลูกค้าจะเห็นตอนสแกน (ไว้ให้ลูกค้าตรวจว่าโอนถูกบัญชี)
 */
export default async function PayPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const user = await requireUser(`/pay/${ref}`);
  const order = await getOrder(ref, user.id);
  if (!order) notFound();
  const q = await searchParams;

  const promptpayId = ((await getSetting("promptpay_id")) ?? "").replace(/\D/g, "");
  const promptpayName = await getSetting("promptpay_name");
  const qrSvg = promptpayId
    ? await QRCode.toString(generatePayload(promptpayId, { amount: order.amount }), { type: "svg", margin: 1, width: 240 })
    : null;
  const plan = await getPlan(order.plan);

  return (
    <Panel title="ชำระเงินผ่าน PromptPay" crumbs={[{ href: "/account", label: "บัญชีของฉัน" }, { label: `คำสั่งซื้อ ${ref}` }]}>
      {q.submitted && <Notice tone="ok">ได้รับข้อมูลการโอนแล้ว ผู้ดูแลจะตรวจสอบและเปิดใช้แพ็กเกจให้ โดยปกติภายใน 1 วันทำการ</Notice>}
      {q.error && <Notice tone="error">กรุณากรอกข้อมูลการโอน</Notice>}

      {order.status === "paid" ? (
        <Notice tone="ok">
          คำสั่งซื้อนี้ชำระแล้ว แพ็กเกจ {plan.name} เปิดใช้งานแล้ว — <Link href="/account">ไปที่บัญชีของฉัน</Link>
        </Notice>
      ) : order.status === "cancelled" ? (
        <Notice tone="error">คำสั่งซื้อนี้ถูกยกเลิก — <Link href="/pricing">สั่งซื้อใหม่</Link></Notice>
      ) : (
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <div className="text-center">
            {qrSvg ? (
              <div className="inline-block border border-wiki-border bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            ) : (
              <Notice tone="error">ยังไม่ได้ตั้งค่าบัญชี PromptPay (ผู้ดูแลตั้งได้ที่ /admin/settings)</Notice>
            )}
            {promptpayName && <p className="mt-1 text-sm">ชื่อบัญชี: {promptpayName}</p>}
          </div>
          <div>
            <table className="wikitable mb-4">
              <tbody>
                <tr>
                  <th scope="row" className="text-left!">แพ็กเกจ</th>
                  <td>
                    {plan.name} × {order.months} เดือน
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="text-left!">ยอดชำระ</th>
                  <td className="text-lg font-bold">{formatNumber(order.amount)} บาท</td>
                </tr>
                <tr>
                  <th scope="row" className="text-left!">รหัสอ้างอิง</th>
                  <td className="font-mono text-lg">{order.ref}</td>
                </tr>
              </tbody>
            </table>
            <ol className="mb-4 list-decimal space-y-1 pl-6 text-sm">
              <li>สแกน QR ด้วยแอปธนาคาร ยอดเงินจะถูกกรอกให้อัตโนมัติ</li>
              <li>
                ใส่รหัสอ้างอิง <b className="font-mono">{order.ref}</b> ในบันทึกช่วยจำ (ถ้าแอปรองรับ)
              </li>
              <li>แจ้งข้อมูลการโอนด้านล่าง เช่น เวลาโอนและธนาคารต้นทาง</li>
            </ol>
            <form action={submitPayment} className="flex flex-col gap-2">
              <input type="hidden" name="ref" value={order.ref} />
              <label htmlFor="note" className="text-sm font-bold">
                ข้อมูลการโอน
              </label>
              <input
                id="note"
                name="note"
                required
                maxLength={255}
                defaultValue={order.payerNote ?? ""}
                placeholder="เช่น โอน 14:32 น. จากกสิกรไทย ชื่อบัญชี สมชาย"
                className={inputCls}
              />
              <button type="submit" className={primaryButtonCls}>
                {order.status === "submitted" ? "แก้ไขข้อมูลการโอน" : "แจ้งโอนแล้ว"}
              </button>
            </form>
          </div>
        </div>
      )}
    </Panel>
  );
}
