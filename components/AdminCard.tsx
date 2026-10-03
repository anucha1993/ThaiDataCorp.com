import type { ReactNode } from "react";

/** กล่องเนื้อหาในระบบหลังบ้าน */
export default function AdminCard({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 border border-wiki-border-light bg-white px-4 py-4 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-wiki-border pb-2">
        <h1 className="font-serif text-xl">{title}</h1>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

const TONE: Record<string, string> = {
  success: "border-green-700 text-green-800",
  running: "border-blue-700 text-blue-800",
  failed: "border-red-700 text-red-800",
  stale: "border-amber-700 text-amber-800",
};

export function RunStatus({ status }: { status: string }) {
  const label: Record<string, string> = { success: "สำเร็จ", running: "กำลังรัน", failed: "ล้มเหลว", stale: "ค้าง" };
  return <span className={`inline-block border bg-white px-1.5 text-xs leading-5 ${TONE[status] ?? "border-gray-500"}`}>{label[status] ?? status}</span>;
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="border border-wiki-border-light bg-wiki-bg px-3 py-2">
      <div className="text-xs text-wiki-muted">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {note && <div className="text-xs text-wiki-muted">{note}</div>}
    </div>
  );
}

export function duration(secs: number | null | undefined): string {
  const s = Number(secs ?? 0);
  if (s < 60) return `${s} วิ`;
  if (s < 3600) return `${Math.floor(s / 60)} นาที ${s % 60} วิ`;
  return `${Math.floor(s / 3600)} ชม. ${Math.floor((s % 3600) / 60)} นาที`;
}
