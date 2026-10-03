import type { Metadata } from "next";
import { decodeParam, TsicView, tsicMetadata } from "@/app/tsic/tsic-view";

// ISR: สร้างเมื่อมีคนเข้าครั้งแรก แล้ว cache 24 ชม.
export const revalidate = 86400;
export async function generateStaticParams(): Promise<Array<{ code: string; province: string }>> {
  return [];
}

type Props = { params: Promise<{ code: string; province: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, province } = await params;
  return tsicMetadata(code, decodeParam(province));
}

export default async function TsicProvincePage({ params }: Props) {
  const { code, province } = await params;
  return <TsicView code={code} province={decodeParam(province)} />;
}
