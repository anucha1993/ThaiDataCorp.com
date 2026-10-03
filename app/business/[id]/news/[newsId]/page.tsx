import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveNews } from "@/app/business/actions";
import FileGuard from "@/components/FileGuard";
import FilePicker from "@/components/FilePicker";
import Panel, { inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { requireUser } from "@/lib/auth";
import { getNews, isCompanyMember, postsThisMonth, quotas } from "@/lib/business";
import { mediaUrl } from "@/lib/uploads";

export const metadata: Metadata = { title: "โพสต์ข่าวสาร", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string; newsId: string }>; searchParams: Promise<{ error?: string }> };

const ERRORS: Record<string, string> = {
  rules: "กรุณายืนยันว่าเนื้อหาเป็นไปตามนโยบาย",
  title: "กรุณากรอกหัวข้อ (อย่างน้อย 4 ตัวอักษร)",
  body: "กรุณากรอกเนื้อหา (อย่างน้อย 20 ตัวอักษร)",
  "image-too-large": "รูปใหญ่เกิน 3MB",
  "image-bad-type": "รูปต้องเป็น JPG, PNG หรือ WebP",
  "image-bad-image": "อ่านไฟล์รูปไม่ได้",
  "image-storage": "บันทึกรูปไม่สำเร็จ (ปัญหาฝั่งเซิร์ฟเวอร์) กรุณาลองใหม่ภายหลัง",
};

export default async function NewsFormPage({ params, searchParams }: Props) {
  const { id, newsId } = await params;
  const user = await requireUser(`/business/${id}/news/${newsId}`);
  if (!(await isCompanyMember(user.id, id))) redirect("/business?error=not-member");
  const isNew = newsId === "new";
  const post = isNew ? null : await getNews(Number(newsId));
  if (!isNew && (!post || post.juristicId !== id || post.status !== "published")) notFound();
  if (isNew && (await postsThisMonth("news_post", id)) >= (await quotas()).news) redirect(`/business/${id}?error=news-quota#news`);
  const error = ERRORS[(await searchParams).error ?? ""];
  const image = mediaUrl(post?.image);

  return (
    <Panel
      title={isNew ? "โพสต์ข่าวสาร" : `แก้ไข: ${post!.title}`}
      crumbs={[{ label: "บัญชีบริษัท", href: "/business" }, { label: "จัดการ", href: `/business/${id}` }, { label: "ข่าวสาร" }]}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <form action={saveNews} encType="multipart/form-data" className="grid max-w-3xl gap-3 text-sm">
        <input type="hidden" name="juristicId" value={id} />
        <input type="hidden" name="newsId" value={isNew ? "" : String(post!.id)} />
        <label className="flex flex-col gap-1">
          หัวข้อ
          <input name="title" required minLength={4} maxLength={200} defaultValue={post?.title} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          เนื้อหา (เว้นบรรทัดเพื่อขึ้นย่อหน้าใหม่)
          <textarea name="body" required minLength={20} maxLength={10000} rows={12} defaultValue={post?.body} className={inputCls} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="รูปปัจจุบัน" className="h-20 border border-wiki-border-light object-cover" />
          )}
          <div className="flex min-w-72 flex-1 flex-col gap-1">
            <b>รูปประกอบข่าว (ไม่บังคับ)</b>
            <FilePicker name="image" accept="image/jpeg,image/png,image/webp" types="image/jpeg,image/png,image/webp" maxMb={3} hint="JPG, PNG, WebP · ไม่เกิน 3MB · ย่อเป็น 1200px อัตโนมัติ" />
            <FileGuard />
          </div>
          {image && (
            <label className="flex items-center gap-1">
              <input type="checkbox" name="removeImage" value="1" /> ลบรูป
            </label>
          )}
        </div>
        <p className="border border-wiki-border-light bg-wiki-bg p-3 text-xs leading-5">
          <b>ห้ามโพสต์:</b> โฆษณาเครื่องดื่มแอลกอฮอล์ บุหรี่/บุหรี่ไฟฟ้า การพนัน · อวดอ้างสรรพคุณอาหาร ยา เครื่องสำอาง หรือเครื่องมือแพทย์ที่ไม่ได้รับอนุญาต
          · ชักชวนลงทุน/สินเชื่อ/เงินดิจิทัล · เนื้อหาหมิ่นประมาท ละเมิดลิขสิทธิ์ หรือข้อมูลเท็จ · ข้อมูลส่วนบุคคลของผู้อื่นโดยไม่ได้รับความยินยอม
        </p>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="rules" value="1" required className="mt-1" />
          <span>
            ยืนยันว่าเนื้อหาเป็นของบริษัทและเป็นไปตาม <Link href="/terms#business" target="_blank">นโยบายเนื้อหา</Link>
          </span>
        </label>
        <div className="flex gap-3">
          <button type="submit" className={primaryButtonCls}>
            {isNew ? "โพสต์" : "บันทึก"}
          </button>
          <Link href={`/business/${id}#news`} className="self-center">
            ยกเลิก
          </Link>
        </div>
      </form>
    </Panel>
  );
}
