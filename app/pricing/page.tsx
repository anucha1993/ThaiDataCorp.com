import type { Metadata } from "next";
import Link from "next/link";
import { startOrder, startTrialAction } from "@/app/actions";
import Panel, { buttonCls, Notice, primaryButtonCls } from "@/components/Panel";
import { formatNumber, SITE_NAME } from "@/lib/format";
import { getPlan, listPublicPlans } from "@/lib/plans";
import { freeModePlanId, isBillingEnabled } from "@/lib/billing";
import FreeModePricing from "@/app/pricing/free-mode";

export async function generateMetadata(): Promise<Metadata> {
  const billing = await isBillingEnabled();
  return {
    title: billing ? "แพ็กเกจและราคา" : "สมัครสมาชิกฟรี",
    description: billing
      ? `แพ็กเกจสมาชิก ${SITE_NAME} — ติดตามบริษัทและหน่วยงาน แจ้งเตือนสัญญาภาครัฐใหม่ และดาวน์โหลดรายชื่อบริษัทเปิดใหม่เป็น CSV`
      : `สมัครสมาชิก ${SITE_NAME} ฟรี — ติดตามบริษัทและหน่วยงานรัฐ รับอีเมลแจ้งเตือนสัญญาภาครัฐและบริษัทเปิดใหม่ และดาวน์โหลดข้อมูลเป็น CSV`,
    alternates: { canonical: "/pricing" },
  };
}

const TRIAL_MSG: Record<string, string> = {
  used: "บัญชีนี้ใช้สิทธิ์ทดลองใช้ฟรีไปแล้ว — เลือกชำระเงินเพื่อใช้งานแพ็กเกจต่อได้",
  active: "บัญชีนี้มีแพ็กเกจเสียเงินที่ยังใช้งานอยู่ จึงไม่ต้องทดลอง",
  unavailable: "แพ็กเกจนี้ไม่มีช่วงทดลองใช้ฟรี",
};

type Props = { searchParams: Promise<{ trial?: string }> };

export default async function PricingPage({ searchParams }: Props) {
  if (!(await isBillingEnabled())) return <FreeModePricing plan={await getPlan(await freeModePlanId())} />;
  const [plans, q] = await Promise.all([listPublicPlans(), searchParams]);
  const trialMsg = q.trial ? TRIAL_MSG[q.trial] : undefined;
  const highlight = plans.find((p) => p.price > 0)?.id;
  return (
    <Panel title="แพ็กเกจและราคา" crumbs={[{ label: "แพ็กเกจ" }]}>
      <p className="mb-6 leading-7">
        ข้อมูลทุกหน้าบน {SITE_NAME} ดูได้ฟรีเสมอ แพ็กเกจสมาชิกช่วยประหยัดเวลา: ติดตามบริษัทและหน่วยงานโดยไม่ต้องเข้ามาเช็กเอง
        รับแจ้งเตือนทางอีเมล และดาวน์โหลดข้อมูลไปใช้ต่อใน Excel/CRM
      </p>
      {trialMsg && <Notice tone="error">{trialMsg}</Notice>}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const id = p.id;
          return (
            <section
              key={id}
              className={`flex flex-col border bg-white p-4 ${id === highlight ? "border-wiki-link shadow-sm" : "border-wiki-border"}`}
            >
              <h2 className="font-serif text-xl">{p.name}</h2>
              <p className="my-2 text-2xl font-bold">
                {p.price === 0 ? "ฟรี" : `${formatNumber(p.price)} บาท`}
                {p.price > 0 && <span className="text-sm font-normal text-wiki-muted"> /เดือน</span>}
              </p>
              {p.trialDays > 0 && (
                <p className="mb-2 inline-block self-start border border-green-700 px-2 text-xs font-bold text-green-800">
                  ทดลองใช้ฟรี {p.trialDays} วัน
                </p>
              )}
              <ul className="mb-4 flex-1 list-disc space-y-1 pl-5 text-sm">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {p.price === 0 ? (
                <Link href="/account" className={buttonCls}>
                  เริ่มใช้ฟรี
                </Link>
              ) : (
                <div className="flex flex-col gap-2">
                {p.trialDays > 0 && (
                  <form action={startTrialAction}>
                    <input type="hidden" name="plan" value={id} />
                    <button type="submit" className={`${primaryButtonCls} w-full`}>
                      ทดลองใช้ฟรี {p.trialDays} วัน
                    </button>
                  </form>
                )}
                <form action={startOrder} className="flex flex-col gap-2">
                  <input type="hidden" name="plan" value={id} />
                  <select name="months" defaultValue="1" className="border border-wiki-border px-2 py-1 text-sm">
                    <option value="1">1 เดือน — {formatNumber(p.price)} บาท</option>
                    <option value="3">3 เดือน — {formatNumber(p.price * 3)} บาท</option>
                    <option value="12">12 เดือน — {formatNumber(p.price * 12)} บาท</option>
                  </select>
                  <button type="submit" className={id === highlight && p.trialDays === 0 ? primaryButtonCls : buttonCls}>
                    ชำระเงิน {p.name}
                  </button>
                </form>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-6 text-xs leading-5 text-wiki-muted">
        ทดลองใช้ฟรีได้ 1 ครั้งต่อบัญชี ไม่ต้องชำระเงินก่อน เมื่อครบกำหนดจะกลับเป็นแพ็กเกจฟรีเอง ·
        ชำระผ่าน PromptPay (สแกน QR ด้วยแอปธนาคารใดก็ได้) แพ็กเกจจะเริ่มใช้งานหลังผู้ดูแลตรวจสอบยอดโอน โดยปกติภายใน 1 วันทำการ
        ราคารวมภาษีมูลค่าเพิ่มแล้ว (ถ้ามี) ดู <Link href="/terms">เงื่อนไขการใช้งาน</Link>
      </p>
    </Panel>
  );
}
