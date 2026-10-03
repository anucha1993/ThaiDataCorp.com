import Link from "next/link";
import type { ReactNode } from "react";

/** กรอบหน้าแบบ Wikipedia สำหรับหน้าบัญชี/ชำระเงิน */
export default function Panel({
  title,
  crumbs = [],
  children,
}: {
  title: string;
  crumbs?: Array<{ href?: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-4">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-wiki-muted">
        <Link href="/">หน้าหลัก</Link>
        {crumbs.map((c) => (
          <span key={c.label}>
            {" › "}
            {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
          </span>
        ))}
      </nav>
      <article className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
        <h1 className="border-b border-wiki-border pb-2 font-serif text-[1.75rem]">{title}</h1>
        <div className="mt-4">{children}</div>
      </article>
    </main>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "error"; children: ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-green-600 bg-green-50 text-green-900"
      : tone === "error"
        ? "border-red-600 bg-red-50 text-red-900"
        : "border-wiki-border bg-wiki-bg";
  return <div className={`mb-4 border-l-4 px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export const buttonCls =
  "inline-block cursor-pointer border border-wiki-border bg-wiki-bg px-4 py-1.5 font-bold text-wiki-text hover:bg-wiki-header hover:no-underline";
export const primaryButtonCls =
  "inline-block cursor-pointer border border-wiki-link bg-wiki-link px-4 py-1.5 font-bold text-white hover:opacity-90 hover:no-underline visited:text-white";
export const inputCls = "border border-wiki-border bg-white px-3 py-1.5 outline-none focus:border-wiki-link";
