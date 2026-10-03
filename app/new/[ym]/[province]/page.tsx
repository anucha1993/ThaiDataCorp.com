import type { Metadata } from "next";
import { NewView, newMetadata, type NewSearchParams } from "@/app/new/view";
import { decodeParam } from "@/app/tsic/tsic-view";

type Props = { params: Promise<{ ym: string; province: string }>; searchParams: NewSearchParams };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { ym, province } = await params;
  return newMetadata(ym, decodeParam(province), searchParams);
}

export default async function NewMonthProvincePage({ params, searchParams }: Props) {
  const { ym, province } = await params;
  return <NewView ym={ym} province={decodeParam(province)} searchParams={searchParams} />;
}
