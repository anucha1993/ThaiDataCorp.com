/**
 * กราฟเส้นสถิติการเข้าชมรายวัน (SVG ล้วน render ฝั่ง server)
 */
import { formatNumber } from "@/lib/format";

const SHORT_TH = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
const shortDate = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${SHORT_TH[Number(iso.slice(5, 7)) - 1]}`;

export function ViewsLine({
  data,
  height = 120,
  color = "#3366cc",
  label = "ครั้ง",
}: {
  data: Array<{ day: string; views: number }>;
  height?: number;
  color?: string;
  label?: string;
}) {
  if (data.length === 0) return null;
  const W = 300;
  const H = height;
  const pad = { l: 4, r: 30, t: 8, b: 18 };
  const max = Math.max(1, ...data.map((d) => d.views));
  // ค่าสูงสุดของแกนหาร 2 ลงตัว (เส้นกลางเป็นจำนวนเต็ม)
  const nice = max <= 4 ? 4 : Math.ceil(max / 10) * 10;
  const x = (i: number) =>
    pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const line = data
    .map(
      (d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.views).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const labels = [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`สถิติการเข้าชม ${data.length} วันล่าสุด`}
    >
      {[0, nice / 2, nice].map((t) => (
        <g key={t}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(t)}
            y2={y(t)}
            stroke="#eaecf0"
          />
          <text x={W - pad.r + 4} y={y(t) + 3.5} fontSize="9" fill="#54595d">
            {formatNumber(t)}
          </text>
        </g>
      ))}
      <path d={area} fill={color} opacity="0.15" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={data.length > 60 ? 1 : 1.6}
        strokeLinejoin="round"
      />
      {/* ช่วงยาว (เช่น 1 ปี) ไม่วาดจุด — จุดจะซ้อนกันจนเส้นดูหนา */}
      {data.length <= 60 &&
        data.map((d, i) => (
          <circle key={d.day} cx={x(i)} cy={y(d.views)} r="1.8" fill={color}>
            <title>{`${shortDate(d.day)}: ${formatNumber(d.views)} ${label}`}</title>
          </circle>
        ))}
      {labels.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 4}
          fontSize="9"
          fill="#54595d"
          textAnchor={
            i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"
          }
        >
          {shortDate(data[i].day)}
        </text>
      ))}
    </svg>
  );
}

/** กล่องสถิติการเข้าชมสำหรับหน้าบริษัท/หน่วยงาน (แบบเดียวกับกล่องข้อมูลด้านข้าง) */
export default function ViewsBox({
  title,
  data,
}: {
  title: string;
  data: Array<{ day: string; views: number }>;
}) {
  const total = data.reduce((s, d) => s + d.views, 0);
  return (
    <section
      aria-label={title}
      className="mt-4 border border-wiki-border bg-white text-sm"
    >
      <h2 className="border-b border-wiki-border bg-wiki-header px-3 py-1.5 text-center font-bold">
        {title}
      </h2>
      <div className="px-3 pt-2 pb-1">
        <ViewsLine data={data} />
      </div>
      <p className="border-t border-wiki-border-light px-3 py-1.5 text-xs text-wiki-muted">
        รวม {formatNumber(total)} ครั้ง · สูงสุด{" "}
        {formatNumber(Math.max(0, ...data.map((d) => d.views)))} ครั้ง/วัน
      </p>
    </section>
  );
}
