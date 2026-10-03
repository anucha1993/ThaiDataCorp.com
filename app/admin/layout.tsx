import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { countOpenRequests } from "@/lib/support";
import { countPendingClaims } from "@/lib/business";

export const metadata: Metadata = { title: "ระบบหลังบ้าน", robots: { index: false, follow: false } };

const NAV = [
  { href: "/admin", label: "ภาพรวม" },
  { href: "/admin/analytics", label: "สถิติผู้เข้าชม" },
  { href: "/admin/jobs", label: "งาน Sync" },
  { href: "/admin/requests", label: "คำร้อง" },
  { href: "/admin/business", label: "บัญชีบริษัท" },
  { href: "/admin/members", label: "สมาชิก" },
  { href: "/admin/orders", label: "คำสั่งซื้อ" },
  { href: "/admin/plans", label: "แพ็กเกจ" },
  { href: "/admin/settings", label: "ตั้งค่า" },
];

/** ทุกหน้าใต้ /admin ต้องเป็นผู้ดูแล (ตรวจซ้ำใน Server Action ทุกตัวด้วย) */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("/admin");
  if (!user.isAdmin) redirect("/account");
  const [openRequests, pendingClaims] = await Promise.all([countOpenRequests().catch(() => 0), countPendingClaims().catch(() => 0)]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-wiki-border pb-2 text-sm">
        <span className="mr-3 font-bold">ระบบหลังบ้าน</span>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="border border-wiki-border-light bg-white px-3 py-1 hover:bg-wiki-bg hover:no-underline">
            {n.label}
            {n.href === "/admin/requests" && openRequests > 0 && (
              <span className="ml-1 rounded-full bg-red-700 px-1.5 text-xs text-white">{openRequests}</span>
            )}
            {n.href === "/admin/business" && pendingClaims > 0 && (
              <span className="ml-1 rounded-full bg-red-700 px-1.5 text-xs text-white">{pendingClaims}</span>
            )}
          </Link>
        ))}
        <span className="ml-auto text-xs text-wiki-muted">{user.email}</span>
      </div>
      {children}
    </div>
  );
}
