import type { Metadata } from "next";
import { ProcurementView, procurementMetadata } from "@/app/procurement/view";
import { decodeParam } from "@/app/tsic/tsic-view";

export const revalidate = 86400;
export async function generateStaticParams(): Promise<Array<{ province: string }>> {
  return [];
}

type Props = { params: Promise<{ province: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return procurementMetadata(decodeParam((await params).province));
}

export default async function ProcurementProvincePage({ params }: Props) {
  return <ProcurementView province={decodeParam((await params).province)} />;
}
