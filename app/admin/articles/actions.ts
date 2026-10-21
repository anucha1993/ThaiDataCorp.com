"use server";
/** บทความอัตโนมัติ (OpenAI) — เฉพาะผู้ดูแล */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { dbQuery } from "@/lib/db";
import { setInternalSettings } from "@/lib/settings";

async function requireAdmin() {
  const user = await requireUser("/admin/articles");
  if (!user.isAdmin) redirect("/account");
  return user;
}
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveAiSettings(formData: FormData) {
  await requireAdmin();
  const model = s(formData, "model").slice(0, 64);
  if (model && !/^[\w.:-]+$/.test(model)) redirect("/admin/articles?error=model");
  const key = s(formData, "apiKey");
  if (key && !/^sk-[\w-]{20,}$/.test(key)) redirect("/admin/articles?error=key");
  await setInternalSettings({
    ai_enabled: formData.get("enabled") === "1" ? "1" : "0",
    ai_auto_publish: formData.get("autoPublish") === "1" ? "1" : "0",
    ai_model: model,
    ai_mode: ["data", "mixed", "general"].includes(s(formData, "mode")) ? s(formData, "mode") : "data",
    // ช่องคีย์ว่าง = ใช้คีย์เดิม · ติ๊กลบ = ลบคีย์ที่บันทึกไว้
    ...(formData.get("clearKey") === "1" ? { openai_api_key: null } : key ? { openai_api_key: key } : {}),
  });
  redirect("/admin/articles?ok=saved");
}

export async function addTopics(formData: FormData) {
  await requireAdmin();
  const topics = s(formData, "topics")
    .split(/\r?\n/)
    .map((t) => t.replace(/\s+/g, " ").trim().slice(0, 250))
    .filter((t) => t.length >= 5)
    .slice(0, 200);
  if (topics.length) await dbQuery(`INSERT INTO ai_topic (topic) VALUES ?`, [topics.map((t) => [t])]);
  redirect(`/admin/articles?ok=topics&n=${topics.length}#topics`);
}

export async function removeTopic(formData: FormData) {
  await requireAdmin();
  await dbQuery(`DELETE FROM ai_topic WHERE id = ? AND status <> 'done'`, [Number(formData.get("id"))]);
  redirect("/admin/articles#topics");
}

export async function setArticleStatus(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const status = s(formData, "status");
  if (!["draft", "published", "rejected"].includes(status)) redirect("/admin/articles");
  await dbQuery(
    `UPDATE ai_article SET status = ?, published_at = IF(? = 'published', COALESCE(published_at, NOW()), published_at) WHERE id = ?`,
    [status, status, id],
  );
  revalidatePath("/guide", "layout");
  revalidatePath("/sitemap.xml");
  redirect(`/admin/articles?ok=${status}#articles`);
}

export async function runAiNow() {
  await requireAdmin();
  await dbQuery(`UPDATE job_schedule SET requested_at = UTC_TIMESTAMP() WHERE job_key = 'ai-articles'`);
  redirect("/admin/articles?ok=queued");
}
