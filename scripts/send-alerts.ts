/**
 * ส่งอีเมลแจ้งเตือนสมาชิก
 *
 *   npm run alerts                 # ส่งจริง (ตั้ง Scheduled Task รายวัน หลัง sync / sync:egp)
 *   npm run alerts -- --dry-run    # แสดงผลอย่างเดียว ไม่ส่ง ไม่บันทึกเวลา
 *   npm run alerts -- --user=a@b.com
 *
 * เนื้อหา:
 *   1) สัญญาภาครัฐใหม่ของบริษัท/หน่วยงานที่ติดตาม (procurement_contract.first_seen_at > รอบก่อน)
 *   1.5) บริษัทที่ติดตามเปลี่ยนชื่อ/ทุน/สถานะ/ที่ตั้ง/ประเภทธุรกิจ (juristic_change.detected_at > รอบก่อน)
 *   2) บริษัทเปิดใหม่ตามเงื่อนไขที่ตั้งไว้ (juristic.created_at > รอบก่อน และจดทะเบียนไม่เกิน 45 วันก่อนรอบก่อน)
 * ความถี่ตามแพ็กเกจ (ฟรี = รายสัปดาห์, Pro/Business = รายวัน)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const MAX_ITEMS = 50;
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

async function main() {
  const dry = process.argv.includes("--dry-run");
  const onlyUser = arg("user")?.toLowerCase();
  const { getPool, closePool } = await import("@/lib/db");
  const { sendMail } = await import("@/lib/mailer");
  const { getPlans, FREE_PLAN_ID } = await import("@/lib/plans");
  const PLANS = await getPlans();
  const { effectivePlan, isBillingEnabled } = await import("@/lib/billing");
  const billing = await isBillingEnabled();
  const { SITE_NAME, SITE_URL, formatNumber, formatThaiDate, agencyUrl } = await import("@/lib/format");
  type Row = import("mysql2").RowDataPacket;
  const pool = getPool();
  const q = async <T extends Row[]>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params))[0];

  const users = await q<Row[]>(
    `SELECT u.id, u.email, u.plan, (u.plan_expires_at > NOW()) active,
       COALESCE(u.last_alert_at, NOW() - INTERVAL 7 DAY) since,
       TIMESTAMPDIFF(HOUR, COALESCE(u.last_alert_at, '2000-01-01'), NOW()) hours_since
     FROM app_user u
     WHERE (EXISTS (SELECT 1 FROM user_watch w WHERE w.user_id = u.id) OR EXISTS (SELECT 1 FROM saved_search s WHERE s.user_id = u.id))
       ${onlyUser ? "AND u.email = ?" : ""}`,
    onlyUser ? [onlyUser] : [],
  );

  let sent = 0;
  for (const u of users) {
    const plan = await effectivePlan(PLANS, PLANS[u.plan] ? u.plan : FREE_PLAN_ID, Number(u.active) === 1);
    // เผื่อเวลารันเหลื่อม 2 ชั่วโมง
    if (Number(u.hours_since) < plan.alertEveryDays * 24 - 2) continue;

    const watches = await q<Row[]>(`SELECT kind, target FROM user_watch WHERE user_id = ?`, [u.id]);
    const companyIds = watches.filter((w) => w.kind === "company").map((w) => w.target);
    const agencies = watches.filter((w) => w.kind === "agency").map((w) => w.target);

    const contracts = companyIds.length || agencies.length
      ? await q<Row[]>(
          `SELECT winner_id, winner_name, agency, project_name, COALESCE(contract_value, agreed_price) value, sign_date
           FROM procurement_contract
           WHERE first_seen_at > ? AND (${[
             companyIds.length ? "winner_id IN (?)" : "",
             agencies.length ? "agency IN (?)" : "",
           ].filter(Boolean).join(" OR ")})
           ORDER BY sign_date DESC LIMIT ?`,
          [u.since, ...(companyIds.length ? [companyIds] : []), ...(agencies.length ? [agencies] : []), MAX_ITEMS],
        )
      : [];

    const changes = companyIds.length
      ? await q<Row[]>(
          `SELECT c.juristic_id, c.field, c.old_value, c.new_value, j.name_th
           FROM juristic_change c LEFT JOIN juristic j ON j.id = c.juristic_id
           WHERE c.detected_at > ? AND c.juristic_id IN (?) ORDER BY c.detected_at DESC LIMIT ?`,
          [u.since, companyIds, MAX_ITEMS],
        )
      : [];

    const searches = await q<Row[]>(
      `SELECT s.tsic_code, s.province, t.name_th FROM saved_search s LEFT JOIN tsic t ON t.code = s.tsic_code WHERE s.user_id = ?`,
      [u.id],
    );
    const newCompanies: Array<{ label: string; rows: Row[] }> = [];
    for (const s of searches) {
      const where = [`created_at > ?`, `register_date >= DATE(?) - INTERVAL 45 DAY`];
      const params: unknown[] = [u.since, u.since];
      if (s.tsic_code) (where.push(`tsic_code = ?`), params.push(s.tsic_code));
      if (s.province) (where.push(`province = ?`), params.push(s.province));
      const rows = await q<Row[]>(
        `SELECT id, name_th, register_date, register_capital, province FROM juristic WHERE ${where.join(" AND ")}
         ORDER BY register_date DESC LIMIT ?`,
        [...params, MAX_ITEMS],
      );
      if (rows.length) {
        newCompanies.push({
          label: `${s.tsic_code ? `${(s.name_th ?? s.tsic_code).trim()}` : "ทุกประเภทธุรกิจ"} · ${s.province ?? "ทุกจังหวัด"}`,
          rows,
        });
      }
    }

    const total = contracts.length + changes.length + newCompanies.reduce((n, g) => n + g.rows.length, 0);
    if (total > 0) {
      const lines: string[] = [];
      const html: string[] = [];
      if (contracts.length) {
        lines.push(`สัญญาภาครัฐใหม่ (${contracts.length} รายการ)`);
        html.push(`<h3>สัญญาภาครัฐใหม่ (${contracts.length} รายการ)</h3><ul>`);
        for (const c of contracts) {
          const t = `${formatThaiDate(c.sign_date)} — ${c.winner_name ?? c.winner_id} ได้สัญญากับ ${c.agency} มูลค่า ${formatNumber(Number(c.value ?? 0))} บาท: ${c.project_name}`;
          lines.push(`• ${t}\n  ${SITE_URL}/company/${c.winner_id}`);
          html.push(
            `<li><a href="${SITE_URL}/company/${c.winner_id}">${c.winner_name ?? c.winner_id}</a> — ${formatThaiDate(c.sign_date)} ` +
              `<a href="${SITE_URL}${agencyUrl(c.agency)}">${c.agency}</a> มูลค่า ${formatNumber(Number(c.value ?? 0))} บาท<br><small>${c.project_name}</small></li>`,
          );
        }
        html.push("</ul>");
      }
      if (changes.length) {
        const LABEL: Record<string, string> = {
          name: "เปลี่ยนชื่อ", capital: "เปลี่ยนทุนจดทะเบียน", status: "เปลี่ยนสถานะ",
          tsic: "เปลี่ยนประเภทธุรกิจ", address: "ย้ายที่ตั้ง", type: "เปลี่ยนประเภทนิติบุคคล",
        };
        const val = (f: string, v: string | null) => (v == null ? "-" : f === "capital" ? `${formatNumber(Number(v))} บาท` : v);
        lines.push(`\nบริษัทที่ติดตามมีการเปลี่ยนแปลง (${changes.length} รายการ)`);
        html.push(`<h3>บริษัทที่ติดตามมีการเปลี่ยนแปลง (${changes.length} รายการ)</h3><ul>`);
        for (const c of changes) {
          const t = `${LABEL[c.field] ?? c.field}: ${val(c.field, c.old_value)} → ${val(c.field, c.new_value)}`;
          lines.push(`• ${c.name_th ?? c.juristic_id} — ${t}\n  ${SITE_URL}/company/${c.juristic_id}`);
          html.push(`<li><a href="${SITE_URL}/company/${c.juristic_id}">${c.name_th ?? c.juristic_id}</a> — ${t}</li>`);
        }
        html.push("</ul>");
      }
      for (const g of newCompanies) {
        lines.push(`\nบริษัทเปิดใหม่: ${g.label} (${g.rows.length} ราย)`);
        html.push(`<h3>บริษัทเปิดใหม่: ${g.label} (${g.rows.length} ราย)</h3><ul>`);
        for (const c of g.rows) {
          lines.push(`• ${c.name_th} — จดทะเบียน ${formatThaiDate(c.register_date)} ทุน ${formatNumber(Number(c.register_capital))} บาท ${c.province ?? ""}\n  ${SITE_URL}/company/${c.id}`);
          html.push(
            `<li><a href="${SITE_URL}/company/${c.id}">${c.name_th}</a> — ${formatThaiDate(c.register_date)} ทุน ${formatNumber(Number(c.register_capital))} บาท ${c.province ?? ""}</li>`,
          );
        }
        html.push("</ul>");
      }
      const footer = `\nจัดการรายการติดตามและการแจ้งเตือนได้ที่ ${SITE_URL}/account`;
      const mail = {
        to: u.email,
        subject: `${SITE_NAME}: ความเคลื่อนไหวใหม่ ${total} รายการ`,
        text: lines.join("\n") + "\n" + footer,
        html: html.join("\n") + `<p style="color:#54595d;font-size:12px">จัดการรายการติดตามได้ที่ <a href="${SITE_URL}/account">${SITE_URL}/account</a></p>`,
      };
      if (dry) console.log(`\n=== ${u.email} (${plan.name}) — ${total} รายการ ===\n${mail.text}`);
      else await sendMail(mail);
      sent++;
    } else if (dry) {
      console.log(`- ${u.email}: ไม่มีความเคลื่อนไหวใหม่`);
    }
    if (!dry) await pool.query(`UPDATE app_user SET last_alert_at = NOW() WHERE id = ?`, [u.id]);
  }
  // เตือนก่อนหมดช่วงทดลองใช้ฟรี 2 วัน (ส่งครั้งเดียวต่อการทดลอง)
  const trials = await q<Row[]>(
    `SELECT id, email, plan, plan_expires_at FROM app_user
     WHERE ${billing ? "1=1" : "1=0"} AND on_trial = 1 AND trial_reminded_at IS NULL
       AND plan_expires_at > NOW() AND plan_expires_at <= NOW() + INTERVAL 2 DAY
       ${onlyUser ? "AND email = ?" : ""}`,
    onlyUser ? [onlyUser] : [],
  );
  for (const t of trials) {
    const plan = PLANS[t.plan];
    const end = formatThaiDate(String(t.plan_expires_at).slice(0, 10));
    const mail = {
      to: t.email,
      subject: `${SITE_NAME}: ช่วงทดลองใช้ ${plan?.name ?? t.plan} จะหมดวันที่ ${end}`,
      text:
        `ช่วงทดลองใช้ฟรีแพ็กเกจ ${plan?.name ?? t.plan} ของคุณจะหมดวันที่ ${end}
` +
        `ชำระเงินก่อนหมดช่วงทดลองเพื่อใช้งานต่อเนื่อง (วันที่เหลือจะนับต่อจากรอบที่ซื้อ):
${SITE_URL}/pricing

` +
        `หากไม่ชำระ บัญชีจะกลับเป็นแพ็กเกจฟรีโดยอัตโนมัติ รายการที่ติดตามจะยังอยู่`,
    };
    if (dry) console.log(`
=== เตือนหมดช่วงทดลอง: ${t.email} ===
${mail.text}`);
    else {
      await sendMail(mail);
      await pool.query(`UPDATE app_user SET trial_reminded_at = NOW() WHERE id = ?`, [t.id]);
    }
  }

  console.log(`✔ ตรวจ ${users.length} ผู้ใช้ — ${dry ? "จะส่ง" : "ส่ง"}อีเมล ${sent} ฉบับ · เตือนหมดช่วงทดลอง ${trials.length} ราย`);
  await closePool();
}

main().catch((err) => {
  console.error("✖ alerts failed:", err);
  process.exit(1);
});
