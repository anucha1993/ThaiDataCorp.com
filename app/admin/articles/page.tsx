import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import AdminCard from "@/components/AdminCard";
import { buttonCls, inputCls, Notice, primaryButtonCls } from "@/components/Panel";
import { addTopics, removeTopic, runAiNow, saveAiSettings, setArticleStatus } from "@/app/admin/articles/actions";
import { DEFAULT_AI_MODEL, getAiConfig, listAiArticles } from "@/lib/ai-articles";
import { dbQuery } from "@/lib/db";
import { getSetting } from "@/lib/settings";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const MSG: Record<string, { tone: "ok" | "error"; text: string }> = {
  "ok:saved": { tone: "ok", text: "บันทึกการตั้งค่าแล้ว" },
  "ok:topics": { tone: "ok", text: "เพิ่มหัวข้อเข้าคิวแล้ว" },
  "ok:published": { tone: "ok", text: "เผยแพร่บทความแล้ว — แสดงที่ /guide" },
  "ok:rejected": { tone: "ok", text: "ไม่ใช้บทความนี้แล้ว (ไม่แสดงบนเว็บ)" },
  "ok:draft": { tone: "ok", text: "ย้ายกลับเป็นฉบับร่างแล้ว (ไม่แสดงบนเว็บ)" },
  "ok:queued": { tone: "ok", text: "สั่งเขียนแล้ว — ตัวจัดคิวจะเริ่มภายใน 5 นาที (ดูผลที่ /admin/jobs)" },
  "error:model": { tone: "error", text: "ชื่อโมเดลไม่ถูกต้อง" },
  "error:key": { tone: "error", text: "รูปแบบ API Key ไม่ถูกต้อง (ขึ้นต้นด้วย sk-)" },
};

export default async function AiArticlesAdmin({ searchParams }: Props) {
  const q = await searchParams;
  const msg = one(q.ok) ? MSG[`ok:${one(q.ok)}`] : one(q.error) ? MSG[`error:${one(q.error)}`] : undefined;
  const [cfg, savedKey, drafts, published, topics, [job], [usage]] = await Promise.all([
    getAiConfig(),
    getSetting("openai_api_key"),
    listAiArticles("draft", 100),
    listAiArticles("published", 100),
    dbQuery<RowDataPacket[]>(`SELECT id, topic, status, error FROM ai_topic WHERE status <> 'done' ORDER BY id LIMIT 200`),
    dbQuery<RowDataPacket[]>(`SELECT enabled, cron, args FROM job_schedule WHERE job_key = 'ai-articles'`),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n, COALESCE(SUM(tokens), 0) t FROM ai_article WHERE created_at > NOW() - INTERVAL 30 DAY`),
  ]);
  const keySource = process.env.OPENAI_API_KEY ? "env" : savedKey ? "db" : null;
  const chk = (name: string, on: boolean) => <input type="checkbox" name={name} value="1" defaultChecked={on} />;

  return (
    <>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <AdminCard
        title="บทความอัตโนมัติ (OpenAI)"
        actions={<span className={cfg.enabled ? "font-bold text-green-800" : "text-wiki-muted"}>{cfg.enabled ? "● เปิดอยู่" : "○ ปิดอยู่"}</span>}
      >
        <Notice>
          <b>คำแนะนำ:</b> Google และ AdSense ไม่ชอบบทความ AI จำนวนมากที่ไม่มีคนตรวจ — ควร<b>อ่านทวนก่อนเผยแพร่</b> (ค่าเริ่มต้น) และตั้งความถี่ไม่เกินวันละ 1 บทความ
          ระบบสั่ง AI ไม่ให้แต่งตัวเลข/ค่าธรรมเนียม/มาตรากฎหมาย แต่ AI ยังผิดพลาดได้ ตรวจข้อเท็จจริงทุกครั้ง
        </Notice>
        <form action={saveAiSettings} className="space-y-3 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              OpenAI API Key{" "}
              <span className="text-xs text-wiki-muted">
                {keySource === "env" ? "ใช้คีย์จาก OPENAI_API_KEY ใน .env อยู่ (แนะนำ)" : keySource === "db" ? "มีคีย์ที่บันทึกไว้แล้ว — เว้นว่างเพื่อใช้คีย์เดิม" : "ยังไม่มีคีย์ — สร้างที่ platform.openai.com → API keys"}
              </span>
              <input name="apiKey" type="password" autoComplete="off" placeholder="sk-..." className={`${inputCls} font-mono`} />
              {keySource === "db" && (
                <label className="flex items-center gap-2 text-xs">
                  {chk("clearKey", false)} ลบคีย์ที่บันทึกไว้
                </label>
              )}
            </label>
            <label className="flex flex-col gap-1">
              โมเดล
              <span className="text-xs text-wiki-muted">ว่าง = {DEFAULT_AI_MODEL} · ใส่ชื่อโมเดลที่บัญชี OpenAI ของคุณใช้ได้</span>
              <input name="model" defaultValue={cfg.model === DEFAULT_AI_MODEL ? "" : cfg.model} placeholder={DEFAULT_AI_MODEL} className={`${inputCls} font-mono`} />
            </label>
          </div>
          <fieldset className="space-y-1">
            <legend className="font-bold">ประเภทบทความที่เขียนอัตโนมัติ</legend>
            {(
              [
                ["data", "สถิติธุรกิจจากข้อมูลจริง (แนะนำ — แม่นที่สุด)", "ตัวเลขดึงจากฐานข้อมูลของเรา AI แค่เรียบเรียง ระบบตรวจตัวเลขทุกตัวซ้ำ ย่อหน้าที่ตัวเลขไม่ตรงจะถูกตัดทิ้ง"],
                ["mixed", "สลับ สถิติธุรกิจ กับ ความรู้ทั่วไป", "ความรู้ทั่วไปเขียนจากความรู้ของ AI ห้ามใส่ตัวเลข ต้องอ่านทวน"],
                ["general", "ความรู้ทั่วไปอย่างเดียว", "AI เสนอหัวข้อเองเมื่อคิวว่าง — ความแม่นยำต่ำกว่า"],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className="flex items-start gap-2">
                <input type="radio" name="mode" value={v} defaultChecked={cfg.mode === v} className="mt-1" />
                <span>
                  {label}
                  <span className="block text-xs text-wiki-muted">{hint}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-wiki-muted">หัวข้อที่เพิ่มในคิวด้านล่าง = ความรู้ทั่วไปเสมอ และเขียนก่อน</p>
          </fieldset>
          <label className="flex items-center gap-2 font-bold">{chk("enabled", cfg.enabled)} เปิดการเขียนบทความอัตโนมัติ</label>
          <label className="flex items-center gap-2">
            {chk("autoPublish", cfg.autoPublish)} เผยแพร่อัตโนมัติโดยไม่ต้องอ่านทวน
            <span className="text-xs text-wiki-muted">
              — สถิติธุรกิจที่ตัวเลขตรงข้อมูลครบเผยแพร่ได้เลย · ความรู้ทั่วไปที่มีตัวเลขจะเก็บเป็นฉบับร่างเสมอ
            </span>
          </label>
          <button type="submit" className={primaryButtonCls}>
            บันทึก
          </button>
        </form>
        <p className="mt-3 text-sm">
          <b>ความถี่:</b> {job ? `${job.enabled ? "เปิด" : "ปิด"} · cron ${job.cron} · ${job.args ?? "--count=1"}` : "-"} —{" "}
          <Link href="/admin/jobs">ตั้งที่งาน &ldquo;เขียนบทความอัตโนมัติ (OpenAI)&rdquo;</Link> (ต้องเปิดทั้งที่นี่และที่งาน) ·{" "}
          <form action={runAiNow} className="inline">
            <button type="submit" className="text-wiki-link hover:underline">
              เขียน 1 บทความตอนนี้
            </button>
          </form>
        </p>
        <p className="text-xs text-wiki-muted">
          30 วันที่ผ่านมา: เขียน {Number(usage?.n ?? 0)} บทความ ใช้ {Number(usage?.t ?? 0).toLocaleString()} tokens (ดูค่าใช้จ่ายจริงที่ platform.openai.com)
        </p>
      </AdminCard>

      <section id="topics">
        <AdminCard title={`คิวหัวข้อ (${topics.length})`}>
          <p className="mb-2 text-sm text-wiki-muted">ระบบหยิบหัวข้อจากคิวก่อน ถ้าคิวว่าง AI จะเสนอหัวข้อใหม่ที่ไม่ซ้ำกับบทความที่มีเอง</p>
          <form action={addTopics} className="mb-3 flex flex-col gap-2 text-sm">
            <textarea name="topics" rows={4} placeholder={"หัวข้อละบรรทัด เช่น\nวิธีเลือกสำนักงานบัญชีสำหรับบริษัทเปิดใหม่\nภาษีหัก ณ ที่จ่ายสำหรับค่าจ้างบริการ"} className={inputCls} />
            <button type="submit" className={`${buttonCls} self-start`}>
              เพิ่มเข้าคิว
            </button>
          </form>
          {topics.length > 0 && (
            <ul className="divide-y divide-wiki-border-light border border-wiki-border-light text-sm">
              {topics.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="flex-1">
                    {t.topic}
                    {t.status === "failed" && <span className="ml-2 text-xs text-red-800">ล้มเหลว: {t.error}</span>}
                  </span>
                  <form action={removeTopic}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="text-xs text-red-800 hover:underline">
                      ลบ
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </section>

      <section id="articles">
        <AdminCard title={`ฉบับร่างรออ่านทวน (${drafts.length})`}>
          <ArticleTable rows={drafts} actions={["published", "rejected"]} />
        </AdminCard>
        <AdminCard title={`เผยแพร่แล้ว (${published.length})`}>
          <ArticleTable rows={published} actions={["draft"]} />
        </AdminCard>
      </section>
    </>
  );
}

const ACTION_LABEL: Record<string, string> = { published: "เผยแพร่", rejected: "ไม่ใช้", draft: "ยกเลิกเผยแพร่" };

function ArticleTable({ rows, actions }: { rows: Awaited<ReturnType<typeof listAiArticles>>; actions: string[] }) {
  if (!rows.length) return <p className="text-sm text-wiki-muted">ยังไม่มี</p>;
  return (
    <table className="wikitable w-full text-sm">
      <thead>
        <tr>
          <th>บทความ</th>
          <th>หมวด</th>
          <th>สร้างเมื่อ</th>
          <th>จัดการ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td>
              <Link href={`/admin/articles/${a.id}`} className="font-bold">
                {a.title}
              </Link>
              <div className="text-xs text-wiki-muted">{a.description}</div>
            </td>
            <td className="whitespace-nowrap">{a.category}</td>
            <td className="whitespace-nowrap text-xs">{a.createdAt.slice(0, 16)}</td>
            <td className="whitespace-nowrap">
              <div className="flex gap-2">
                <Link href={`/admin/articles/${a.id}`}>อ่าน</Link>
                {actions.map((st) => (
                  <form key={st} action={setArticleStatus}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="status" value={st} />
                    <button type="submit" className={`hover:underline ${st === "published" ? "font-bold text-green-800" : "text-red-800"}`}>
                      {ACTION_LABEL[st]}
                    </button>
                  </form>
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
