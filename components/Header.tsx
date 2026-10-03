import Image from "next/image";
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

/** โลโก้ ThaiDataCorp (public/brand/logo-thaidatacorp.png — ต้นฉบับ 494×505 พื้นโปร่งใส) */
function Logo() {
  return (
    <Image
      src="/brand/logo-thaidatacorp.png"
      alt=""
      width={494}
      height={505}
      loading="eager"
      sizes="48px"
      className="h-12 w-auto shrink-0"
    />
  );
}
