/** สร้างไฟล์ CSV ที่เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน (UTF-8 + BOM) */

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // กัน CSV/formula injection: ค่าที่ขึ้นต้นด้วย = + - @ ให้ใส่ ' นำหน้า
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
