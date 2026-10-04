import { SkeletonPage } from "@/components/Skeleton";

/** โครงหน้าติดต่อเราระหว่างรอข้อมูล */
export default function Loading() {
  return <SkeletonPage variant="form" narrow />;
}
