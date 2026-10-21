"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** เมนูหลักใต้ Header — ลิงก์ธรรมดา (crawl ได้) ไฮไลต์หน้าปัจจุบัน · จอเล็กเลื่อนแนวนอนในแถบได้ */
const ITEMS: Array<[string, string]> = [
  ["/new", "บริษัทเปิดใหม่"],
  ["/changes", "ความเคลื่อนไหว"],
  ["/tsic", "ประเภทธุรกิจ"],
  ["/procurement", "งานภาครัฐ"],
  ["/report", "ดัชนีรายเดือน"],
  ["/guide", "บทความ"],
];

export default function MainNav() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="เมนูหลัก" className="border-t border-wiki-border-light">
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 text-sm [scrollbar-width:none]">
        {ITEMS.map(([href, label]) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-block border-b-2 px-2.5 py-1.5 hover:no-underline ${
                  active ? "border-wiki-link font-bold text-wiki-text!" : "border-transparent text-wiki-link hover:border-wiki-border"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
