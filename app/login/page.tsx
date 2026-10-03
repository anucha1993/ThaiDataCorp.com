import type { Metadata } from "next";
import Link from "next/link";
import { loginAction } from "@/app/actions";
import GoogleButton from "@/components/GoogleButton";
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
  const ext = one(q.ext);
  const registerHref = `/register?${new URLSearchParams({ next, ...(email && { email }), ...(pending && { pending }) })}`;

  const errors: Record<string, React.ReactNode> = {
    invalid: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    locked: "ใส่รหัสผ่านผิดหลายครั้ง บัญชีถูกล็อกชั่วคราว กรุณารอ 15 นาทีแล้วลองใหม่",
    "no-password": "บัญชีนี้สมัครไว้ก่อนระบบรหัสผ่าน และยังไม่ได้ตั้งรหัสผ่าน — กรุณาติดต่อผู้ดูแลเว็บไซต์เพื่อตั้งรหัสผ่าน",
    "social-only": "อีเมลนี้สมัครไว้ด้วย Google — กดเข้าสู่ระบบด้วย Google แล้วตั้งรหัสผ่านได้ที่หน้า “บัญชีของฉัน”",
    "g-cancel": "ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว",
    "g-state": "การเข้าสู่ระบบด้วย Google หมดเวลาหรือไม่ถูกต้อง กรุณาลองใหม่",
    "g-failed": "เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่ หรือใช้อีเมลแทน",
    "g-off": "ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Google",
  };
  const error = errors[one(q.error) ?? ""];

  return (
    <Panel title="เข้าสู่ระบบ" crumbs={[{ label: "เข้าสู่ระบบ" }]}>
      {error && <Notice tone="error">{error}</Notice>}
      {ext === "link-password" && (
        <Notice>
          อีเมล <b>{email}</b> ของ Google มีบัญชีที่ตั้งรหัสผ่านไว้แล้ว — กรอกรหัสผ่านเพื่อยืนยันว่าเป็นบัญชีของคุณ
          ระบบจะเชื่อม Google ให้ ครั้งต่อไปกดเข้าสู่ระบบด้วย Google ได้ทันที
        </Notice>
      )}
      {ext === "need-email" && (
        <Notice>
          บัญชี Google ของคุณไม่มีอีเมลที่ยืนยันแล้ว — เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน หรือ{" "}
          <Link href={registerHref}>สมัครสมาชิกใหม่</Link> แล้วระบบจะเชื่อม Google เข้ากับบัญชีนั้นให้
        </Notice>
      )}

      {!pending && <GoogleButton next={next} label="เข้าสู่ระบบด้วย Google" />}

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
        ลืมรหัสผ่าน: ถ้าใช้ Gmail หรือเคยเชื่อม Google ให้เข้าสู่ระบบด้วย Google แล้วตั้งรหัสใหม่ที่ &ldquo;บัญชีของฉัน&rdquo;
        หรือติดต่อผู้ดูแลเว็บไซต์
      </p>
    </Panel>
  );
}
