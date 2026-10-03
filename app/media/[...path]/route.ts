/** เสิร์ฟรูปที่ผู้ใช้อัปโหลด (โลโก้ / รูปข่าว) จาก storage/public — ชื่อไฟล์เป็น UUID จึง cache ได้ตลอด */
import { readStored } from "@/lib/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const file = await readStored("public", (await params).path.join("/"));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: {
      "content-type": file.type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
