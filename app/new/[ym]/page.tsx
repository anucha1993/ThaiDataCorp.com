import type { Metadata } from "next";
import { NewView, newMetadata, type NewSearchParams } from "@/app/new/view";

type Props = { params: Promise<{ ym: string }>; searchParams: NewSearchParams };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return newMetadata((await params).ym, undefined, searchParams);
}

export default async function NewMonthPage({ params, searchParams }: Props) {
  return <NewView ym={(await params).ym} searchParams={searchParams} />;
}
