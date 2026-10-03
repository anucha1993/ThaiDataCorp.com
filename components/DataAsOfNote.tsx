import type { DataAsOf } from "@/types/company";

const fmt = (iso: string, withTime: boolean) =>
  new Date(iso).toLocaleString("th-TH", {
    dateStyle: "long",
    ...(withTime && { timeStyle: "short" }),
    timeZone: "Asia/Bangkok",
  });

/** บอกว่าข้อมูลทะเบียนที่แสดงเป็นข้อมูล ณ เมื่อไร และมาจากแหล่งใด */
export default function DataAsOfNote({ asOf, compact = false }: { asOf?: DataAsOf; compact?: boolean }) {
  if (!asOf) return null;
  if (asOf.kind === "dbd") {
    return compact ? (
      <span title="ตรวจสอบกับ DBD Open API ของกรมพัฒนาธุรกิจการค้า">
        ข้อมูล DBD ณ <time dateTime={asOf.at}>{fmt(asOf.at, false)}</time>
      </span>
    ) : (
      <>
        ข้อมูลทะเบียนตรวจสอบกับกรมพัฒนาธุรกิจการค้า (DBD Open API) ล่าสุดเมื่อ{" "}
        <time dateTime={asOf.at}>{fmt(asOf.at, true)} น.</time> — ระบบตรวจสอบซ้ำทุก 30 วัน
      </>
    );
  }
  const what = asOf.kind === "opend-dissolved" ? "วันจดทะเบียนเลิก" : "วันจดทะเบียน";
  const set = asOf.kind === "opend-dissolved" ? "นิติบุคคลจดทะเบียนเลิกกิจการ" : "นิติบุคคลจดทะเบียนตั้งใหม่";
  return compact ? (
    <span title={`ชุดข้อมูล${set}${asOf.period ? ` เดือน${asOf.period}` : ""} (data.go.th)`}>ข้อมูล ณ {what}</span>
  ) : (
    <>
      ข้อมูล ณ {what} จากชุดข้อมูล{set}
      {asOf.period && ` ประจำเดือน${asOf.period}`} (data.go.th, นำเข้าเมื่อ <time dateTime={asOf.at}>{fmt(asOf.at, false)}</time>) —
      การเปลี่ยนแปลงภายหลัง เช่น เปลี่ยนชื่อหรือเพิ่มทุน อาจยังไม่แสดง ระบบกำลังทยอยตรวจสอบกับ DBD
    </>
  );
}
