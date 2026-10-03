import type { Metadata } from "next";
import Link from "next/link";
import { registerAction } from "@/app/actions";
import GoogleButton from "@/components/GoogleButton";
import Panel, { inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { PASSWORD_MIN } from "@/lib/password";

export const metadata: Metadata = { title: "สมัครสมาชิก", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RegisterPage({ searchParams }: Props) {
  const q = await searchParams;
  const next = safeNext(one(q.next));
  // เข้าสู่ระบบอยู่แล้ว → ไม่ต้องเห็นหน้าเข้าสู่ระบบ/สมัคร
  if (await getCurrentUser()) redirect(next);
  const email = one(q.email) ?? "";
  const pending = one(q.pending) ?? "";
  const loginHref = `/login?${new URLSearchParams({ next, ...(email && { email }), ...(pending && { pending }) })}`;

  const errors: Record<string, React.ReactNode> = {
    email: "รูปแบบอีเมลไม่ถูกต้อง",
    short: `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`,
    long: "รหัสผ่านยาวเกินไป",
    mismatch: "ยืนยันรหัสผ่านไม่ตรงกัน",
    terms: "กรุณายอมรับเงื่อนไขการใช้งาน",
    exists: (
      <>
        อีเมลนี้สมัครสมาชิกไว้แล้ว — <Link href={loginHref}>เข้าสู่ระบบ</Link>
      </>
    ),
    "no-password": "อีเมลนี้มีบัญชีอยู่แล้วแต่ยังไม่ได้ตั้งรหัสผ่าน — กรุณาติดต่อผู้ดูแลเว็บไซต์เพื่อตั้งรหัสผ่าน",
    "social-only": "อีเมลนี้สมัครไว้ด้วย Google — กดเข้าสู่ระบบด้วย Google แล้วตั้งรหัสผ่านได้ที่หน้า “บัญชีของฉัน”",
  };
  const error = errors[one(q.error) ?? ""];

  return (
    <Panel title="สมัครสมาชิก" crumbs={[{ label: "สมัครสมาชิก" }]}>
      {error && <Notice tone="error">{error}</Notice>}
      {pending && <Notice>สมัครด้วยอีเมลแล้วระบบจะเชื่อมบัญชี Google ของคุณเข้ากับบัญชีใหม่ให้</Notice>}

      <p className="mb-4 leading-7">สมัครฟรี ไม่มีค่าใช้จ่าย — ใช้ได้ทั้งเครื่องมือติดตามบริษัท แจ้งเตือน และดาวน์โหลดข้อมูล</p>

      {!pending && <GoogleButton next={next} label="สมัครด้วย Google" />}

      <form action={registerAction} className="flex max-w-md flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        {pending && <input type="hidden" name="pending" value={pending} />}
        <label htmlFor="email" className="text-sm font-bold">
          อีเมล
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} className={inputCls} />
        <label htmlFor="password" className="text-sm font-bold">
          รหัสผ่าน <span className="font-normal text-wiki-muted">(อย่างน้อย {PASSWORD_MIN} ตัวอักษร)</span>
        </label>
        <input id="password" name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className={inputCls} />
        <label htmlFor="password2" className="text-sm font-bold">
          ยืนยันรหัสผ่าน
        </label>
        <input id="password2" name="password2" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className={inputCls} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="accept" value="1" required className="mt-1" />
          <span>
            ยอมรับ <Link href="/terms">เงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว</Link>
          </span>
        </label>
        <button type="submit" className={primaryButtonCls}>
          สมัครสมาชิก
        </button>
      </form>

      <p className="mt-4 text-sm">
        มีบัญชีแล้ว? <Link href={loginHref}>เข้าสู่ระบบ</Link>
      </p>
    </Panel>
  );
}
