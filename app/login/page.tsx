import type { Metadata } from "next";
import Link from "next/link";
import { loginAction } from "@/app/actions";
import FacebookButton from "@/components/FacebookButton";
import Panel, { inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "เข้าสู่ระบบ", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: Props) {
  const q = await searchParams;
  const next = safeNext(one(q.next));
  const email = one(q.email) ?? "";
  const pending = one(q.pending) ?? "";
  const fb = one(q.fb);
  const registerHref = `/register?${new URLSearchParams({ next, ...(email && { email }), ...(pending && { pending }) })}`;

  const errors: Record<string, React.ReactNode> = {
    invalid: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    locked: "ใส่รหัสผ่านผิดหลายครั้ง บัญชีถูกล็อกชั่วคราว กรุณารอ 15 นาทีแล้วลองใหม่",
    "no-password": "บัญชีนี้สมัครไว้ก่อนระบบรหัสผ่าน และยังไม่ได้ตั้งรหัสผ่าน — กรุณาติดต่อผู้ดูแลเว็บไซต์เพื่อตั้งรหัสผ่าน",
    "facebook-only": "อีเมลนี้สมัครไว้ด้วย Facebook — กดเข้าสู่ระบบด้วย Facebook แล้วตั้งรหัสผ่านได้ที่หน้า “บัญชีของฉัน”",
    "fb-cancel": "ยกเลิกการเข้าสู่ระบบด้วย Facebook แล้ว",
    "fb-state": "การเข้าสู่ระบบด้วย Facebook หมดเวลาหรือไม่ถูกต้อง กรุณาลองใหม่",
    "fb-failed": "เชื่อมต่อ Facebook ไม่สำเร็จ กรุณาลองใหม่ หรือใช้อีเมลแทน",
    "fb-off": "ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Facebook",
  };
  const error = errors[one(q.error) ?? ""];

  return (
    <Panel title="เข้าสู่ระบบ" crumbs={[{ label: "เข้าสู่ระบบ" }]}>
      {error && <Notice tone="error">{error}</Notice>}
      {fb === "link-password" && (
        <Notice>
          อีเมล <b>{email}</b> ของ Facebook มีบัญชีที่ตั้งรหัสผ่านไว้แล้ว — กรอกรหัสผ่านเพื่อยืนยันว่าเป็นบัญชีของคุณ
          ระบบจะเชื่อม Facebook ให้ ครั้งต่อไปกดเข้าสู่ระบบด้วย Facebook ได้ทันที
        </Notice>
      )}
      {fb === "need-email" && (
        <Notice>
          บัญชี Facebook ของคุณไม่ได้แชร์อีเมลกับเรา — เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน หรือ{" "}
          <Link href={registerHref}>สมัครสมาชิกใหม่</Link> แล้วระบบจะเชื่อม Facebook เข้ากับบัญชีนั้นให้
        </Notice>
      )}

      {!pending && <FacebookButton next={next} label="เข้าสู่ระบบด้วย Facebook" />}

      <form action={loginAction} className="flex max-w-md flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        {pending && <input type="hidden" name="pending" value={pending} />}
        <label htmlFor="email" className="text-sm font-bold">
          อีเมล
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} className={inputCls} />
        <label htmlFor="password" className="text-sm font-bold">
          รหัสผ่าน
        </label>
        <input id="password" name="password" type="password" required autoComplete="current-password" autoFocus={Boolean(email)} className={inputCls} />
        <button type="submit" className={primaryButtonCls}>
          เข้าสู่ระบบ
        </button>
      </form>

      <p className="mt-4 text-sm">
        ยังไม่มีบัญชี? <Link href={registerHref}>สมัครสมาชิกฟรี</Link>
      </p>
      <p className="mt-2 text-xs text-wiki-muted">
        ลืมรหัสผ่าน: ถ้าเคยเชื่อม Facebook ให้เข้าสู่ระบบด้วย Facebook แล้วตั้งรหัสใหม่ที่ &ldquo;บัญชีของฉัน&rdquo;
        หรือติดต่อผู้ดูแลเว็บไซต์
      </p>
    </Panel>
  );
}
