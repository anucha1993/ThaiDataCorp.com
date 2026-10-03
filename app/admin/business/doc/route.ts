/** เปิดไฟล์เอกสารยืนยันบริษัท — เฉพาะผู้ดูแล และเฉพาะไฟล์ที่อยู่ในคำขอนั้นจริง (ไม่ cache) */
import { getCurrentUser } from "@/lib/auth";
import { getClaim } from "@/lib/business";
import { readStored } from "@/lib/uploads";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const claim = await getClaim(Number(url.searchParams.get("claim")));
  const name = url.searchParams.get("f") ?? "";
  if (!claim || claim.docsDeletedAt || !claim.docFiles.includes(name)) return new Response("Not found", { status: 404 });
  const file = await readStored("private", name);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: {
      "content-type": file.type,
      "content-disposition": "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
  });
}
