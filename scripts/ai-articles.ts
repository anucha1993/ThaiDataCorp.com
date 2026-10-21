/**
 * เขียนบทความอัตโนมัติด้วย OpenAI — ตั้งความถี่ที่ /admin/jobs (งาน "ai-articles")
 *
 *   npm run ai:articles                # ตามจำนวนต่อรอบ (ค่าเริ่มต้น 1)
 *   npm run ai:articles -- --count=3
 *
 * หยิบหัวข้อจากคิว (/admin/articles) ก่อน ถ้าคิวว่างให้ AI เสนอหัวข้อใหม่ที่ไม่ซ้ำ
 * ค่าเริ่มต้นบันทึกเป็นฉบับร่าง (ผู้ดูแลอ่านทวนแล้วกดเผยแพร่) — เผยแพร่อัตโนมัติได้ถ้าเปิดไว้ในหน้าแอดมิน
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

async function main() {
  const { getPool, closePool } = await import("@/lib/db");
  const { getAiConfig, proposeTopic, writeArticle, writeDataArticle, saveAiArticle, countRiskyText, dropItems } = await import("@/lib/ai-articles");
  const { checkWording } = await import("@/lib/ai-claims");
  const { nextSegments, gatherFacts, segmentKey } = await import("@/lib/ai-data-facts");
  // ชื่อ/slug ของคู่มือที่เขียนเอง (อ่านจากไฟล์ — ไม่ import component React ในสคริปต์)
  const { readdirSync, readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "content", "guides");
  const GUIDES = readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => {
      const src = readFileSync(path.join(dir, f), "utf8");
      return { slug: src.match(/slug: "([^"]+)"/)?.[1] ?? f.replace(/\.tsx$/, ""), title: src.match(/title: "([^"]+)"/)?.[1] ?? "" };
    });
  const pool = getPool();
  type Row = import("mysql2").RowDataPacket;

  const cfg = await getAiConfig();
  if (!cfg.enabled) {
    console.log("ปิดการเขียนบทความอัตโนมัติอยู่ (/admin/articles) — ข้าม");
    return closePool();
  }
  if (!cfg.apiKey) {
    console.log("ยังไม่ได้ใส่ OpenAI API Key (/admin/articles หรือ OPENAI_API_KEY ใน .env) — ข้าม");
    return closePool();
  }
  const count = Math.max(1, Math.min(10, Number(arg("count") ?? 1)));

  // กันค่าใช้จ่ายบานปลาย: เพดาน token ต่อ 24 ชม. (ตั้งได้ด้วย AI_DAILY_TOKEN_LIMIT ค่าเริ่มต้น 300,000 ≈ 12 บทความสถิติ)
  const dailyLimit = Number(process.env.AI_DAILY_TOKEN_LIMIT ?? 300_000);
  const usedToday = async () => {
    const [[r]] = await pool.query<Row[]>(`SELECT COALESCE(SUM(tokens), 0) t FROM ai_article WHERE created_at > NOW() - INTERVAL 1 DAY`);
    return Number(r.t);
  };

  for (let i = 0; i < count; i++) {
    const used = await usedToday();
    if (used >= dailyLimit) {
      console.log(`  • ใช้ไปแล้ว ${used.toLocaleString()} tokens ใน 24 ชม. (เพดาน ${dailyLimit.toLocaleString()}) — หยุดก่อน`);
      break;
    }
    const [existing] = await pool.query<Row[]>(`SELECT slug, title, kind FROM ai_article WHERE status <> 'rejected'`);
    const titles = [...GUIDES.map((g) => g.title), ...existing.map((r) => r.title as string)];
    // "stats" = หน้ารวมบทความสถิติ (/guide/stats) ห้ามใช้เป็น slug
    const slugs = new Set(["stats", ...GUIDES.map((g) => g.slug), ...existing.map((r) => r.slug as string)]);

    // หัวข้อจากคิวก่อน (ผู้ดูแลสั่งเอง) — ถ้าไม่มี: โหมด data เขียนสถิติจากข้อมูลจริง, mixed สลับกับความรู้ทั่วไป
    const [[queued]] = await pool.query<Row[]>(`SELECT id, topic FROM ai_topic WHERE status = 'queued' ORDER BY id LIMIT 1`);
    const dataCount = existing.filter((r) => r.kind === "data").length;
    const wantData = !queued && (cfg.mode === "data" || (cfg.mode === "mixed" && dataCount <= existing.length - dataCount));
    if (wantData) {
      const done = await writeDataOne(slugs);
      if (done !== "none") continue;
      if (cfg.mode === "data") {
        console.log("  • เขียนสถิติครบทุกกลุ่มที่มีข้อมูลพอแล้ว");
        break;
      }
    }
    let topic: string = queued?.topic ?? "(AI เสนอหัวข้อ)";
    let tokens = 0;
    try {
      if (!queued) {
        const p = await proposeTopic(cfg, titles);
        topic = p.topic;
        tokens += p.tokens;
        console.log(`  • AI เสนอหัวข้อ: ${topic}`);
      }
      const w = await writeArticle(cfg, topic, titles);
      tokens += w.tokens;
      if (!w.article) throw new Error("บทความที่ได้สั้นหรือโครงสร้างไม่ครบ — ไม่บันทึก");
      // กฎถ้อยคำ (ชื่อบริษัท ลิงก์ Markdown การตีความเกิน) ใช้กับความรู้ทั่วไปด้วย
      const cleaned = dropItems(w.article.sections, checkWording, "กฎ");
      for (const d of cleaned.dropped) console.log(`      ✂ ${d}`);
      if (cleaned.sections.length < 3) throw new Error(`ตัดย่อหน้าที่ไม่ผ่านกฎแล้วเหลือเนื้อหาไม่พอ (ตัด ${cleaned.dropped.length} จุด)`);
      const article = { ...w.article, sections: cleaned.sections };
      const norm = (t: string) => t.replace(/\s+/g, "").toLowerCase();
      if (titles.some((t) => norm(t) === norm(article.title))) throw new Error(`ชื่อซ้ำกับบทความที่มีแล้ว: ${article.title}`);
      // เผยแพร่อัตโนมัติเฉพาะบทความที่ไม่มีตัวเลข — มีตัวเลขเก็บเป็นฉบับร่างให้คนตรวจเสมอ
      const risky = countRiskyText({ sections: article.sections });
      const publish = cfg.autoPublish && risky === 0 && cleaned.dropped.length === 0;
      const id = await saveAiArticle(article, { topic, model: cfg.model, tokens, publish }, slugs);
      if (queued) await pool.query(`UPDATE ai_topic SET status = 'done', article_id = ?, error = NULL WHERE id = ?`, [id, queued.id]);
      console.log(`  ✓ #${id} ${article.title} (${publish ? "เผยแพร่แล้ว" : `ฉบับร่าง — รออ่านทวน${risky ? `, มีตัวเลขต้องตรวจ ${risky} จุด` : ""}`}, ${tokens.toLocaleString()} tokens)`);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 480);
      if (queued) await pool.query(`UPDATE ai_topic SET status = 'failed', error = ? WHERE id = ?`, [msg, queued.id]);
      console.error(`  ✖ ${topic}: ${msg}`);
    }
  }
  await closePool();

  /** บทความสถิติ 1 กลุ่ม — คืน "none" ถ้าไม่มีกลุ่มเหลือ */
  async function writeDataOne(slugs: Set<string>): Promise<"ok" | "failed" | "none"> {
    for (const seg of await nextSegments(5)) {
      const key = segmentKey(seg);
      const facts = await gatherFacts(seg);
      if (!facts) {
        // ข้อมูลไม่พอ — บันทึกไว้ไม่ให้วนกลับมาเลือกซ้ำ
        await pool.query(`INSERT INTO ai_topic (topic, status, error) VALUES (?, 'failed', 'ข้อมูลไม่พอสำหรับบทความสถิติ')`, [key]);
        continue;
      }
      try {
        const r = await writeDataArticle(cfg, facts);
        if (!r.article) throw new Error("บทความที่ได้สั้นหรือโครงสร้างไม่ครบ — ไม่บันทึก");
        // ตัวเลขทุกตัวตรวจกับข้อมูลแล้ว — เผยแพร่อัตโนมัติได้ถ้าไม่มีย่อหน้าที่ถูกตัด
        const publish = cfg.autoPublish && r.check?.dropped.length === 0;
        const id = await saveAiArticle(
          r.article,
          {
            topic: key,
            model: cfg.model,
            tokens: r.tokens,
            publish,
            kind: "data",
            dataKey: key,
            extra: { facts: facts.table, source: facts.source, links: facts.links, check: r.check ?? undefined },
          },
          slugs,
        );
        console.log(
          `  ✓ #${id} [สถิติ] ${r.article.title} (${publish ? "เผยแพร่แล้ว" : "ฉบับร่าง"}, ตัวเลขตรงข้อมูล ${r.check?.verified ?? 0} ตัว, ตัดทิ้ง ${r.check?.dropped.length ?? 0} จุด, ${r.tokens.toLocaleString()} tokens)`,
        );
        for (const d of r.check?.dropped ?? []) console.log(`      ✂ ${d}`);
        return "ok";
      } catch (e) {
        const msg = (e as Error).message.slice(0, 480);
        await pool.query(`INSERT INTO ai_topic (topic, status, error) VALUES (?, 'failed', ?)`, [key, msg]);
        console.error(`  ✖ [สถิติ] ${facts.subject}: ${msg}`);
        return "failed";
      }
    }
    return "none";
  }
}

main().catch((err) => {
  console.error("✖ ai-articles failed:", err);
  process.exit(1);
});
