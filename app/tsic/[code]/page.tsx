import type { Metadata } from "next";
import { TsicView, tsicMetadata } from "@/app/tsic/tsic-view";

// ISR: สร้างเมื่อมีคนเข้าครั้งแรก แล้ว cache 24 ชม.
export const revalidate = 86400;
export async function generateStaticParams(): Promise<Array<{ code: string }>> {
  return [];
}

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return tsicMetadata(code);
}

export default async function TsicCodePage({ params }: Props) {
  const { code } = await params;
  return <TsicView code={code} />;
}
