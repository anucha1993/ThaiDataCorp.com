import { SkeletonHeading, SkeletonStats, SkeletonTable } from "@/components/Skeleton";

/** โครงหน้าระบบหลังบ้านระหว่างรอข้อมูล (แถบเมนูผู้ดูแลอยู่ใน layout แสดงค้างไว้) */
export default function Loading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">กำลังโหลดข้อมูล…</span>
      <SkeletonStats />
      <SkeletonHeading />
      <SkeletonTable rows={8} />
    </div>
  );
}
