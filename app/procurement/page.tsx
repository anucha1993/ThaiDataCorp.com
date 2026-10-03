import type { Metadata } from "next";
import { ProcurementView, procurementMetadata } from "@/app/procurement/view";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return procurementMetadata();
}

export default function ProcurementPage() {
  return <ProcurementView />;
}
