"use client";

import { useState } from "react";

/** โค้ดป้ายยืนยันให้คัดลอกไปวางบนเว็บไซต์บริษัท */
export default function BadgeEmbed({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <textarea
        readOnly
        value={code}
        rows={3}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full border border-wiki-border bg-wiki-bg px-2 py-1 font-mono text-xs"
        aria-label="โค้ด HTML ของป้าย"
      />
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(code).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            },
            () => setCopied(false),
          );
        }}
        className="self-start border border-wiki-border bg-white px-3 py-1 text-sm hover:border-wiki-text"
      >
        {copied ? "✔ คัดลอกแล้ว" : "คัดลอกโค้ด"}
      </button>
    </div>
  );
}
