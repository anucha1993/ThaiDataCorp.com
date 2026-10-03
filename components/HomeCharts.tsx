/**
 * กราฟสำหรับหน้าแรก — SVG/HTML ล้วน render ฝั่ง server (ไม่ต้องโหลดไลบรารีกราฟ ไม่ต้องใช้ JavaScript)
 * โทนสีแบบกราฟของ Wikipedia
 */
import Image from "next/image";
import Link from "next/link";
import { formatNumber } from "@/lib/format";

const BLUE = "#3366cc";
const BLUE_LIGHT = "#a3bfe8";

/** กราฟแท่งรายเดือน (เดือนล่าสุดเน้นสี) */
export function MonthlyBars({ data }: { data: Array<{ ym: string; label: string; short: string; count: number }> }) {
  if (data.length === 0) return null;
  const W = 760;
  const H = 290;
  const pad = { l: 48, r: 8, t: 12, b: 34 };
  const max = Math.max(...data.map((d) => d.count));
  const step = Math.pow(10, Math.floor(Math.log10(max || 1)));
  const top = Math.ceil(max / step) * step;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="จำนวนนิติบุคคลจดทะเบียนใหม่รายเดือน">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eaecf0" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#54595d">
            {formatNumber(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = pad.l + i * bw;
        const last = i === data.length - 1;
        return (
          <a key={d.ym} href={`/new/${d.ym}`}>
            <rect x={x + bw * 0.15} y={y(d.count)} width={bw * 0.7} height={y(0) - y(d.count)} fill={last ? BLUE : BLUE_LIGHT}>
              <title>{`${d.label}: ${formatNumber(d.count)} ราย`}</title>
            </rect>
            {(i % 3 === 0 || last) && (
              <text x={x + bw / 2} y={H - pad.b + 16} textAnchor="middle" fontSize="11" fill="#54595d">
                {d.short}
              </text>
            )}
          </a>
        );
      })}
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#a2a9b1" />
    </svg>
  );
}

/** แท่งแนวนอนพร้อมป้ายชื่อ (อันดับ) */
export function RankBars({
  rows,
  unit,
  format = formatNumber,
}: {
  rows: Array<{ label: string; value: number; href: string; sub?: string }>;
  unit?: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="space-y-1.5 text-sm">
      {rows.map((r, i) => (
        <li key={r.href} className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2">
          <span className="text-right text-xs text-wiki-muted tabular-nums">{i + 1}</span>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Link href={r.href} className="truncate" title={r.label}>
                {r.label}
              </Link>
              <span className="shrink-0 text-xs text-wiki-muted tabular-nums">
                {format(r.value)}
                {unit && ` ${unit}`}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 bg-wiki-bg">
              <div className="h-full" style={{ width: `${(r.value / max) * 100}%`, background: i === 0 ? BLUE : BLUE_LIGHT }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** แท่งสัดส่วน (stacked) + คำอธิบายสี */
export function ShareBar({ parts }: { parts: Array<{ label: string; value: number }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const colors = [BLUE, "#14866d", "#ac6600", "#72777d", "#d33"];
  return (
    <div className="text-sm">
      <div className="flex h-4 overflow-hidden border border-wiki-border-light">
        {parts.map((p, i) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: colors[i % colors.length] }} title={p.label} />
        ))}
      </div>
      <ul className="mt-2 space-y-0.5">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: colors[i % colors.length] }} />
            <span className="flex-1">{p.label}</span>
            <span className="text-wiki-muted tabular-nums">
              {((p.value / total) * 100).toFixed(1)}% · {formatNumber(p.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** โลโก้ ThaiDataCorp ขนาดใหญ่สำหรับหน้าแรก (ไฟล์เดียวกับหัวเว็บ) */
export function PortalGlobe({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-thaidatacorp.png"
      alt="ThaiDataCorp"
      width={494}
      height={505}
      loading="eager"
      sizes="(min-width: 768px) 256px, 208px"
      className={`object-contain ${className}`}
    />
  );
}
