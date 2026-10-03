import type { Metadata } from "next";
import Link from "next/link";
import { requestLogin } from "@/app/actions";
import Panel, { inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { safeNext } from "@/lib/auth";
import { isFacebookConfigured } from "@/lib/facebook";

export const metadata: Metadata = { title: "เข้าสู่ระบบ", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ERRORS: Record<string, string> = {
  email: "รูปแบบอีเมลไม่ถูกต้อง",
  rate: "ขอลิงก์บ่อยเกินไป กรุณารอ 10 นาทีแล้วลองใหม่",
  token: "ลิงก์เข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่",
  "fb-cancel": "ยกเลิกการเข้าสู่ระบบด้วย Facebook แล้ว",
  "fb-state": "การเข้าสู่ระบบด้วย Facebook หมดเวลาหรือไม่ถูกต้อง กรุณาลองใหม่",
  "fb-failed": "เชื่อมต่อ Facebook ไม่สำเร็จ กรุณาลองใหม่ หรือใช้อีเมลแทน",
  "fb-off": "ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Facebook",
};

export default async function LoginPage({ searchParams }: Props) {
  const q = await searchParams;
  const next = safeNext(one(q.next));
  const error = ERRORS[one(q.error) ?? ""];
  const sent = one(q.sent) === "1";
  const devLink = one(q.dev);
  const needEmail = one(q.fb) === "need-email";
  const pending = one(q.pending) ?? "";
  const facebook = isFacebookConfigured();

  return (
    <Panel title="เข้าสู่ระบบ / สมัครสมาชิก" crumbs={[{ label: "เข้าสู่ระบบ" }]}>
      {error && <Notice tone="error">{error}</Notice>}

      {sent ? (
        <>
          <Notice tone="ok">
            ส่งลิงก์เข้าสู่ระบบไปที่ <b>{one(q.email)}</b> แล้ว กรุณาเปิดอีเมลแล้วกดลิงก์ (ใช้ได้ภายใน 30 นาที)
            ถ้าไม่พบ โปรดตรวจในโฟลเดอร์จดหมายขยะ
          </Notice>
          {devLink && (
            <Notice>
              <b>โหมดพัฒนา (ยังไม่ได้ตั้งค่า SMTP):</b> <a href={devLink}>กดเพื่อเข้าสู่ระบบ</a>
            </Notice>
          )}
          <p className="text-sm">
            <Link href={`/login?next=${encodeURIComponent(next)}`}>ใช้อีเมลอื่น</Link>
          </p>
        </>
      ) : (
        <>
          {needEmail ? (
            <Notice>
              บัญชี Facebook ของคุณไม่ได้แชร์อีเมลกับเรา กรุณากรอกอีเมลเพื่อรับลิงก์ยืนยัน — เมื่อกดลิงก์แล้ว
              ระบบจะเชื่อม Facebook เข้ากับบัญชีนี้ให้ ครั้งต่อไปกดเข้าสู่ระบบด้วย Facebook ได้ทันที
            </Notice>
          ) : (
            <>
              {facebook && (
                <>
                  <a
                    href={`/auth/facebook?next=${encodeURIComponent(next)}`}
                    className="mb-4 flex max-w-md items-center justify-center gap-2 border border-[#1877f2] bg-[#1877f2] px-4 py-2 font-bold text-white visited:text-white hover:opacity-90 hover:no-underline"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
                      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" />
                    </svg>
                    เข้าสู่ระบบ / สมัครด้วย Facebook
                  </a>
                  <p className="mb-4 max-w-md text-center text-xs text-wiki-muted">— หรือใช้อีเมล —</p>
                </>
              )}
              <p className="mb-4 leading-7">
                กรอกอีเมลเพื่อรับลิงก์เข้าสู่ระบบ ไม่ต้องตั้งรหัสผ่าน ถ้ายังไม่เคยใช้งาน ระบบจะสร้างบัญชีฟรีให้อัตโนมัติ
                {facebook && " — ถ้าเคยเข้าด้วย Facebook ที่ใช้อีเมลเดียวกัน จะเป็นบัญชีเดียวกัน"}
              </p>
            </>
          )}
          <form action={requestLogin} className="flex max-w-md flex-col gap-3">
            <input type="hidden" name="next" value={next} />
            {needEmail && <input type="hidden" name="pending" value={pending} />}
            <label htmlFor="email" className="text-sm font-bold">
              อีเมล
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={inputCls} />
            <button type="submit" className={primaryButtonCls}>
              ส่งลิงก์เข้าสู่ระบบ
            </button>
          </form>
          <p className="mt-4 text-xs text-wiki-muted">
            การเข้าสู่ระบบถือว่ายอมรับ <Link href="/terms">เงื่อนไขการใช้งาน</Link> ของ ThaiDataCorp
          </p>
        </>
      )}
    </Panel>
  );
}
