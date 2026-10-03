/** ตรวจ/จัดรูปเลขทะเบียนนิติบุคคล — ไม่มี I/O ใช้ได้ทั้งเว็บและสคริปต์ */

/**
 * ตรวจเลขทะเบียนนิติบุคคล 13 หลัก ด้วย checksum แบบเดียวกับเลขประจำตัวประชาชน
 * กันการยิง API ด้วย id มั่ว และกัน URL ขยะถูก index
 */
export function isValidJuristicId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

/** ตัดขีด/ช่องว่างออกจาก input ของผู้ใช้ เช่น "0-1055-53000-12-1" */
export function normalizeJuristicIdInput(input: string): string {
  return input.replace(/[\s-]/g, "");
}

/**
 * เลข 13 หลักที่ขึ้นต้นด้วย 099 เป็นเลขผู้เสียภาษีของหน่วยงานรัฐ รัฐวิสาหกิจ มูลนิธิ/สมาคม ฯลฯ
 * ไม่ได้จดทะเบียนกับกรมพัฒนาธุรกิจการค้า → DBD Open API ไม่มีข้อมูล (ตอบ 403)
 */
export function isNonDbdTaxId(id: string): boolean {
  return id.startsWith("099");
}
