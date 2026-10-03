import type { JuristicStatus } from "@/types/company";

const STYLES: Record<JuristicStatus, string> = {
  active: "border-green-700 text-green-800",
  abandoned: "border-amber-700 text-amber-800",
  dissolved: "border-red-700 text-red-800",
  liquidated: "border-gray-600 text-gray-700",
  unknown: "border-gray-500 text-gray-600",
};

export default function StatusBadge({ status, text }: { status: JuristicStatus; text: string }) {
  return (
    <span className={`inline-block rounded-sm border bg-white px-1.5 text-[0.8rem] leading-5 ${STYLES[status]}`}>{text}</span>
  );
}
