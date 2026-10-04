/**
 * ผู้ใช้ที่ login อยู่ — ให้ Header (UserNav) เรียกฝั่ง browser
 * แยกออกมาเป็น endpoint เพื่อให้หน้าเว็บทั่วไปยังเป็น static/ISR ได้ (ไม่ต้องอ่าน cookie ตอน render)
 */
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  const body = user
    ? {
        loggedIn: true,
        name: user.displayName || user.email.split("@")[0],
        email: user.email,
        isAdmin: user.isAdmin,
        paid: Boolean(user.planExpiresAt && Date.parse(String(user.planExpiresAt).replace(" ", "T")) > Date.now()),
      }
    : { loggedIn: false };
  return Response.json(body, { headers: { "cache-control": "private, no-store" } });
}
