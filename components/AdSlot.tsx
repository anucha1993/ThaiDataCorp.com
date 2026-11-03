"use client";

import { usePathname } from "next/navigation";
import { isExcludedPath, type AdProduct, type AdPlacement } from "@/lib/ads-config";
import { useMe } from "@/lib/use-me";

/**
 * การ์ดสินค้า Shopee Affiliate
 * - ป้าย "สินค้าแนะนำจาก Shopee · ลิงก์พันธมิตร" ชัดเจน (เปิดเผยว่าเราได้ค่าคอมมิชชั่น)
 * - ลิงก์ผ่าน /go/[id] เพื่อนับคลิก · rel="sponsored nofollow" ตามแนวทาง Google สำหรับลิงก์ affiliate
 * - ไม่แสดงในหน้าที่ห้าม และไม่แสดงให้สมาชิกเสียเงิน (ถ้าตั้งไว้)
 */
export default function AdSlot({
  products,
  placement,
  hideForPaid,
  extraExcluded,
}: {
  products: AdProduct[];
  placement: AdPlacement;
  hideForPaid: boolean;
  extraExcluded: string[];
}) {
  const pathname = usePathname();
  const [me] = useMe();
  if (isExcludedPath(pathname, { extraExcluded })) return null;
  if (hideForPaid && me?.loggedIn && me.paid) return null;

  const grid = placement === "content_bottom" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2";
  return (
    <aside aria-label="สินค้าแนะนำ" className="my-6 clear-both">
      <div className="mb-1 text-[11px] tracking-wide text-wiki-muted">สินค้าแนะนำจาก Shopee · ลิงก์พันธมิตร (เราได้ค่าคอมมิชชั่นเมื่อมีการสั่งซื้อ)</div>
      <div className={`grid gap-2 ${grid}`}>
        {products.map((p) => (
          <a
            key={p.id}
            href={`/go/${p.id}`}
            target="_blank"
            rel="sponsored nofollow noopener"
            className="flex flex-col border border-wiki-border-light bg-white text-sm text-wiki-text no-underline hover:border-[#ee4d2d] hover:no-underline"
          >
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- รูปจาก CDN ของ Shopee (ไม่ผ่าน next/image)
              <img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-contain" />
            ) : (
              <span className="flex aspect-square w-full items-center justify-center bg-[#ee4d2d] text-lg font-bold text-white">Shopee</span>
            )}
            <span className="flex flex-1 flex-col gap-1 p-2">
              <span className="line-clamp-2 leading-5">{p.name}</span>
              {p.price && <span className="mt-auto font-bold text-[#ee4d2d]">฿{p.price.replace(/^฿/, "")}</span>}
            </span>
          </a>
        ))}
      </div>
    </aside>
  );
}
