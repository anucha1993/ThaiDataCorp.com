import Link from "next/link";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/format";
import { isBillingEnabled } from "@/lib/billing";
import UserNav from "@/components/UserNav";

/**
 * Header สไตล์ Wikipedia — Server Component (มีแค่เมนูบัญชี UserNav ที่เป็น client component)
 * ช่องค้นหาเป็น <form method="get"> ส่งไปที่ /search จึงทำงานได้แม้ปิด JS
 */
export default async function Header() {
  const billing = await isBillingEnabled();
  return (
    <header className="border-b border-wiki-border bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
        <Link href="/" className="group flex shrink-0 items-center gap-3 text-wiki-text! hover:no-underline">
          <Logo />
          <span className="flex flex-col leading-tight">
            <span className="font-serif text-[1.6rem] tracking-wide">
              Thai<span className="font-bold">Data</span>Corp
            </span>
            <span className="text-xs text-wiki-muted">{SITE_TAGLINE}</span>
          </span>
        </Link>

        <form action="/search" method="get" role="search" className="flex w-full max-w-xl flex-1 sm:mx-auto">
          <label htmlFor="site-search" className="sr-only">
            ค้นหาบริษัท
          </label>
          <input
            id="site-search"
            name="q"
            type="search"
            placeholder={`ค้นหาใน ${SITE_NAME} ด้วยชื่อบริษัท หรือเลขทะเบียน 13 หลัก`}
            autoComplete="off"
            enterKeyHint="search"
            className="min-w-0 flex-1 rounded-l-sm border border-wiki-border bg-white px-3 py-1.5 text-sm outline-none focus:border-wiki-link"
          />
          <button
            type="submit"
            className="rounded-r-sm border border-l-0 border-wiki-border bg-wiki-bg px-4 py-1.5 text-sm font-bold text-wiki-text hover:bg-wiki-header"
          >
            ค้นหา
          </button>
        </form>
        <UserNav billing={billing} />
      </div>
    </header>
  );
}

/** โลโก้แบบ "ลูกโลกตัวต่อ" ของ Wikipedia ในรูป SVG เรียบง่าย (inline เพื่อไม่ต้องโหลดไฟล์เพิ่ม) */
function Logo() {
  return (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true" className="shrink-0">
      <circle cx="24" cy="24" r="21" fill="#fff" stroke="#202122" strokeWidth="2" />
      <path d="M3 24h42M24 3c-7 6-7 36 0 42M24 3c7 6 7 36 0 42" fill="none" stroke="#72777d" strokeWidth="1.5" />
      <path d="M7 14h34M7 34h34" fill="none" stroke="#a2a9b1" strokeWidth="1.2" />
      <text x="24" y="29" textAnchor="middle" fontFamily="Georgia, serif" fontSize="14" fontWeight="bold" fill="#202122">
        TD
      </text>
    </svg>
  );
}
