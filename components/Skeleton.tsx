/**
 * โครงหน้าระหว่างรอข้อมูล (skeleton) — ใช้ใน loading.tsx และ <Suspense fallback>
 * ขนาดใกล้เคียงหน้าจริง เพื่อไม่ให้หน้ากระตุก (CLS) ตอนเนื้อหาจริงมาแทน
 * ไม่มี JavaScript — เป็น HTML/CSS ล้วน
 */

/** แท่งสีเทากระพริบ */
export function Bone({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-sm bg-wiki-border-light/70 ${className}`} />;
}

function Busy({ children, label = "กำลังโหลดข้อมูล" }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

/** ข้อความหลายบรรทัด */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} className={`h-3.5 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** ตาราง */
export function SkeletonTable({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="border border-wiki-border-light">
      <div className="flex gap-3 border-b border-wiki-border-light bg-wiki-bg px-3 py-2">
        {Array.from({ length: cols }, (_, i) => (
          <Bone key={i} className={`h-3.5 ${i === 0 ? "flex-[2]" : "flex-1"}`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3 border-b border-wiki-border-light px-3 py-2.5 last:border-b-0">
          {Array.from({ length: cols }, (_, i) => (
            <Bone key={i} className={`h-3 ${i === 0 ? "flex-[2]" : "flex-1"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** กล่องตัวเลขสรุป */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border border-wiki-border-light px-3 py-2">
          <Bone className="mb-2 h-3 w-1/2" />
          <Bone className="h-6 w-3/4" />
        </div>
      ))}
    </div>
  );
}

/** หัวข้อส่วน (เส้นใต้แบบ wiki-h2) */
export function SkeletonHeading() {
  return (
    <div className="mt-6 mb-3 border-b border-wiki-border pb-1.5">
      <Bone className="h-5 w-48" />
    </div>
  );
}

/** ส่วนหนึ่งของหน้า (หัวข้อ + ตาราง) — ใช้เป็น Suspense fallback */
export function SkeletonSection({ rows = 5, cols = 4, label }: { rows?: number; cols?: number; label?: string }) {
  return (
    <Busy label={label}>
      <SkeletonHeading />
      <SkeletonTable rows={rows} cols={cols} />
    </Busy>
  );
}

/** หน้าเต็ม — กรอบเดียวกับหน้าจริง (breadcrumb + article) */
export function SkeletonPage({
  variant = "list",
  narrow = false,
}: {
  /** list = หัวข้อ + คำอธิบาย + ตาราง · report = ตัวเลขสรุป + กราฟ · form = ฟอร์ม/แผงควบคุม */
  variant?: "list" | "report" | "form";
  narrow?: boolean;
}) {
  return (
    <main className={`mx-auto ${narrow ? "max-w-4xl" : "max-w-6xl"} px-4 py-4`}>
      <Busy>
        <Bone className="mb-3 h-3.5 w-40" />
        <div className="border border-wiki-border-light bg-white px-4 py-5 sm:px-8">
          <div className="border-b border-wiki-border pb-3">
            <Bone className="h-8 w-2/3 max-w-md" />
          </div>
          <div className="mt-4">
            <SkeletonLines lines={2} />
          </div>
          {variant === "report" && (
            <>
              <div className="mt-5">
                <SkeletonStats />
              </div>
              <SkeletonHeading />
              <Bone className="h-56 w-full" />
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <SkeletonHeading />
                  <SkeletonLines lines={6} />
                </div>
                <div>
                  <SkeletonHeading />
                  <SkeletonLines lines={6} />
                </div>
              </div>
            </>
          )}
          {variant === "list" && (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Bone key={i} className="h-7 w-24" />
                ))}
              </div>
              <SkeletonHeading />
              <SkeletonTable rows={10} />
            </>
          )}
          {variant === "form" && (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i}>
                    <Bone className="mb-1.5 h-3 w-24" />
                    <Bone className="h-8 w-full" />
                  </div>
                ))}
              </div>
              <SkeletonHeading />
              <SkeletonTable rows={4} cols={3} />
            </>
          )}
        </div>
      </Busy>
    </main>
  );
}
