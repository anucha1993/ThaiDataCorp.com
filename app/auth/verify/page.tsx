import type { Metadata } from "next";
import { confirmLogin } from "@/app/actions";
import Panel, { Notice, primaryButtonCls } from "@/components/Panel";

export const metadata: Metadata = { title: "ยืนยันเข้าสู่ระบบ", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/**
 * ต้องกดปุ่มยืนยัน (POST) — ไม่ login ทันทีตอนเปิดลิงก์
 * เพราะระบบอีเมลบางเจ้าเปิดลิงก์ล่วงหน้าเพื่อสแกนไวรัส ซึ่งจะทำให้ token ถูกใช้ไปก่อนผู้ใช้กด
 */
export default async function VerifyPage({ searchParams }: Props) {
  const t = (await searchParams).token;
  const token = Array.isArray(t) ? t[0] : t;
  return (
    <Panel title="ยืนยันเข้าสู่ระบบ">
      {token ? (
        <form action={confirmLogin}>
          <input type="hidden" name="token" value={token} />
          <p className="mb-4">กดปุ่มด้านล่างเพื่อเข้าสู่ระบบ ThaiDataCorp</p>
          <button type="submit" className={primaryButtonCls}>
            เข้าสู่ระบบ
          </button>
        </form>
      ) : (
        <Notice tone="error">ลิงก์ไม่ถูกต้อง</Notice>
      )}
    </Panel>
  );
}
