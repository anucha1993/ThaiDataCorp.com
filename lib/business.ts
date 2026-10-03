/**
 * บัญชีบริษัท — ยืนยันตัวตนด้วยเอกสาร แล้วจัดการโปรไฟล์ ประกาศงาน และข่าวสารของบริษัทตนเอง
 *
 * กติกา
 *  - ต้องยื่นเอกสาร (หนังสือรับรอง + บัตรกรรมการผู้มีอำนาจ หรือหนังสือมอบอำนาจ + บัตรผู้รับมอบ) ทุกบริษัท
 *  - ผู้ดูแลตรวจแล้ว อนุมัติ/ปฏิเสธ → ไฟล์เอกสารถูกลบทันที (เก็บแค่ผลการพิจารณา) ลดภาระข้อมูลส่วนบุคคล
 *  - ข้อมูลทะเบียนจากภาครัฐแก้ไม่ได้ — บริษัทแก้ได้เฉพาะ "ข้อมูลจากเจ้าของกิจการ"
 *  - ประกาศงาน/ข่าว จำกัดจำนวนต่อเดือนต่อบริษัท (ตั้งที่ /admin/settings) · ผู้สมัครติดต่อบริษัทโดยตรง เว็บเป็นเพียงพื้นที่ลงประกาศ
 */
import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { deleteStored } from "@/lib/uploads";

/* --------------------------------------------------------------- ค่าคงที่ */

export const EMPLOYMENT_TYPES = {
  FULL_TIME: "งานประจำ",
  PART_TIME: "พาร์ทไทม์",
  CONTRACTOR: "สัญญาจ้าง / ฟรีแลนซ์",
  TEMPORARY: "ชั่วคราว",
  INTERN: "ฝึกงาน",
} as const;
export type EmploymentType = keyof typeof EMPLOYMENT_TYPES;
export const isEmploymentType = (t: unknown): t is EmploymentType => typeof t === "string" && t in EMPLOYMENT_TYPES;

export const JOB_DAYS_DEFAULT = 30;
export const JOB_DAYS_MAX = 60;

export async function quotas(): Promise<{ jobs: number; news: number }> {
  const n = async (k: string) => {
    const v = Number(await getSetting(k));
    return Number.isInteger(v) && v >= 0 ? v : 3;
  };
  return { jobs: await n("company_jobs_per_month"), news: await n("company_news_per_month") };
}

/* -------------------------------------------------------- คำขอสิทธิ์บริษัท */

export interface Claim {
  id: number;
  juristicId: string;
  companyName: string | null;
  userId: number;
  userEmail: string | null;
  status: "pending" | "approved" | "rejected";
  contactName: string;
  position: string | null;
  phone: string;
  docFiles: string[];
  docsDeletedAt: string | null;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

function toClaim(r: RowDataPacket): Claim {
  let docs: string[] = [];
  try {
    docs = r.doc_files ? JSON.parse(r.doc_files) : [];
  } catch {
    /* ignore */
  }
  return {
    id: Number(r.id), juristicId: r.juristic_id, companyName: r.company_name ?? null, userId: Number(r.user_id),
    userEmail: r.user_email ?? null, status: r.status, contactName: r.contact_name, position: r.position, phone: r.phone,
    docFiles: docs, docsDeletedAt: r.docs_deleted_at ? String(r.docs_deleted_at) : null, adminNote: r.admin_note,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null, createdAt: String(r.created_at),
  };
}

const CLAIM_SELECT = `SELECT c.*, j.name_th company_name, u.email user_email FROM company_claim c
  LEFT JOIN juristic j ON j.id = c.juristic_id LEFT JOIN app_user u ON u.id = c.user_id`;

export async function createClaim(c: {
  juristicId: string; userId: number; contactName: string; position: string | null; phone: string; docFiles: string[];
}): Promise<number> {
  const r = await dbQuery<ResultSetHeader>(
    `INSERT INTO company_claim (juristic_id, user_id, contact_name, position, phone, doc_files) VALUES (?, ?, ?, ?, ?, ?)`,
    [c.juristicId, c.userId, c.contactName, c.position, c.phone, JSON.stringify(c.docFiles)],
  );
  return r.insertId;
}

export async function pendingClaimFor(userId: number, juristicId: string): Promise<boolean> {
  const [r] = await dbQuery<RowDataPacket[]>(
    `SELECT 1 FROM company_claim WHERE user_id = ? AND juristic_id = ? AND status = 'pending' LIMIT 1`,
    [userId, juristicId],
  );
  return Boolean(r);
}

export async function listMyClaims(userId: number): Promise<Claim[]> {
  const rows = await dbQuery<RowDataPacket[]>(`${CLAIM_SELECT} WHERE c.user_id = ? ORDER BY c.id DESC LIMIT 50`, [userId]);
  return rows.map(toClaim);
}

export async function listClaims(status: string, page = 1, size = 50): Promise<{ rows: Claim[]; total: number }> {
  const where = ["pending", "approved", "rejected"].includes(status) ? "WHERE c.status = ?" : "";
  const params = where ? [status] : [];
  const [rows, count] = await Promise.all([
    dbQuery<RowDataPacket[]>(`${CLAIM_SELECT} ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`, [...params, size, (page - 1) * size]),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM company_claim c ${where}`, params),
  ]);
  return { rows: rows.map(toClaim), total: Number(count[0]?.n ?? 0) };
}

export async function countPendingClaims(): Promise<number> {
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM company_claim WHERE status = 'pending'`);
  return Number(r?.n ?? 0);
}

export async function getClaim(id: number): Promise<Claim | null> {
  const [r] = await dbQuery<RowDataPacket[]>(`${CLAIM_SELECT} WHERE c.id = ?`, [id]);
  return r ? toClaim(r) : null;
}

/** อนุมัติ/ปฏิเสธ แล้วลบไฟล์เอกสารทิ้งทันที */
export async function decideClaim(id: number, approve: boolean, adminId: number, note: string | null): Promise<Claim | null> {
  const c = await getClaim(id);
  if (!c || c.status !== "pending") return null;
  await dbQuery(
    `UPDATE company_claim SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW(), docs_deleted_at = NOW() WHERE id = ?`,
    [approve ? "approved" : "rejected", note, adminId, id],
  );
  if (approve) {
    await dbQuery(`INSERT IGNORE INTO company_member (juristic_id, user_id, claim_id) VALUES (?, ?, ?)`, [c.juristicId, c.userId, id]);
  }
  for (const f of c.docFiles) await deleteStored("private", f);
  return c;
}

/* ------------------------------------------------------------ สมาชิกบริษัท */

export async function isCompanyMember(userId: number, juristicId: string): Promise<boolean> {
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT 1 FROM company_member WHERE user_id = ? AND juristic_id = ?`, [userId, juristicId]);
  return Boolean(r);
}

export async function listMyCompanies(userId: number): Promise<Array<{ id: string; name: string | null }>> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT m.juristic_id id, j.name_th name FROM company_member m LEFT JOIN juristic j ON j.id = m.juristic_id
     WHERE m.user_id = ? ORDER BY m.created_at`,
    [userId],
  );
  return rows.map((r) => ({ id: String(r.id), name: r.name ? String(r.name) : null }));
}

export async function isVerifiedCompany(juristicId: string): Promise<boolean> {
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT 1 FROM company_member WHERE juristic_id = ? LIMIT 1`, [juristicId]);
  return Boolean(r);
}

export async function listCompanyMembers(juristicId: string) {
  return dbQuery<RowDataPacket[]>(
    `SELECT m.user_id, u.email, m.created_at FROM company_member m JOIN app_user u ON u.id = m.user_id WHERE m.juristic_id = ?`,
    [juristicId],
  );
}

export async function removeCompanyMember(juristicId: string, userId: number): Promise<void> {
  await dbQuery(`DELETE FROM company_member WHERE juristic_id = ? AND user_id = ?`, [juristicId, userId]);
}

/* ---------------------------------------------------------------- โปรไฟล์ */

export interface CompanyProfile {
  about: string | null;
  services: string | null;
  logo: string | null;
  hidden: boolean;
  updatedAt: string;
}

export async function getProfile(juristicId: string): Promise<CompanyProfile | null> {
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT * FROM company_profile WHERE juristic_id = ?`, [juristicId]);
  return r ? { about: r.about, services: r.services, logo: r.logo, hidden: Number(r.hidden) === 1, updatedAt: String(r.updated_at) } : null;
}

export async function saveProfile(juristicId: string, userId: number, p: { about: string | null; services: string | null; logo?: string | null }) {
  const old = await getProfile(juristicId);
  await dbQuery(
    `INSERT INTO company_profile (juristic_id, about, services, logo, updated_by) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE about = VALUES(about), services = VALUES(services), logo = VALUES(logo), updated_by = VALUES(updated_by)`,
    [juristicId, p.about, p.services, p.logo === undefined ? (old?.logo ?? null) : p.logo, userId],
  );
  // เปลี่ยน/ลบโลโก้ → ลบไฟล์เก่า
  if (p.logo !== undefined && old?.logo && old.logo !== p.logo) await deleteStored("public", old.logo);
}

export async function setProfileHidden(juristicId: string, hidden: boolean): Promise<void> {
  await dbQuery(
    `INSERT INTO company_profile (juristic_id, hidden) VALUES (?, ?) ON DUPLICATE KEY UPDATE hidden = VALUES(hidden)`,
    [juristicId, hidden ? 1 : 0],
  );
}

/* -------------------------------------------------------------- ประกาศงาน */

export interface JobPost {
  id: number;
  juristicId: string;
  companyName: string | null;
  companyLogo: string | null;
  title: string;
  employmentType: EmploymentType;
  province: string;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryNote: string | null;
  positions: number;
  description: string;
  qualifications: string | null;
  benefits: string | null;
  image: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactLine: string | null;
  status: "active" | "closed" | "hidden";
  validThrough: string;
  createdAt: string;
  updatedAt: string;
  /** แสดงต่อสาธารณะได้ (active และยังไม่หมดอายุ) */
  live: boolean;
}

const JOB_SELECT = `SELECT p.*, j.name_th company_name, cp.logo company_logo,
  (p.status = 'active' AND p.valid_through >= CURDATE()) live
  FROM job_post p LEFT JOIN juristic j ON j.id = p.juristic_id LEFT JOIN company_profile cp ON cp.juristic_id = p.juristic_id`;

function toJob(r: RowDataPacket): JobPost {
  return {
    id: Number(r.id), juristicId: r.juristic_id, companyName: r.company_name ?? null, companyLogo: r.company_logo ?? null,
    title: r.title, employmentType: r.employment_type, province: r.province, location: r.location,
    salaryMin: r.salary_min === null ? null : Number(r.salary_min), salaryMax: r.salary_max === null ? null : Number(r.salary_max),
    salaryNote: r.salary_note, positions: Number(r.positions), description: r.description, qualifications: r.qualifications,
    benefits: r.benefits, image: r.image ?? null, contactName: r.contact_name, contactPhone: r.contact_phone, contactEmail: r.contact_email,
    contactLine: r.contact_line, status: r.status, validThrough: String(r.valid_through).slice(0, 10),
    createdAt: String(r.created_at), updatedAt: String(r.updated_at), live: Number(r.live) === 1,
  };
}

export type JobInput = Omit<JobPost, "id" | "juristicId" | "companyName" | "companyLogo" | "status" | "createdAt" | "updatedAt" | "live" | "image">;

/** จำนวนประกาศที่สร้างในเดือนนี้ (เวลาไทย) — นับรวมที่ปิด/ถูกซ่อนแล้ว กันลบแล้วลงใหม่ */
export async function postsThisMonth(table: "job_post" | "news_post", juristicId: string): Promise<number> {
  const [r] = await dbQuery<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM ${table} WHERE juristic_id = ?
       AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
    [juristicId],
  );
  return Number(r?.n ?? 0);
}

export async function createJob(juristicId: string, userId: number, j: JobInput, image: string | null): Promise<number> {
  const r = await dbQuery<ResultSetHeader>(
    `INSERT INTO job_post (juristic_id, title, employment_type, province, location, salary_min, salary_max, salary_note, positions,
       description, qualifications, benefits, image, contact_name, contact_phone, contact_email, contact_line, valid_through, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [juristicId, j.title, j.employmentType, j.province, j.location, j.salaryMin, j.salaryMax, j.salaryNote, j.positions, j.description,
      j.qualifications, j.benefits, image, j.contactName, j.contactPhone, j.contactEmail, j.contactLine, j.validThrough, userId],
  );
  return r.insertId;
}

/** image: undefined = ไม่เปลี่ยน · null = ลบรูป · string = รูปใหม่ (ลบไฟล์เก่าให้) */
export async function updateJob(id: number, juristicId: string, j: JobInput, image?: string | null): Promise<void> {
  if (image !== undefined) {
    const [old] = await dbQuery<RowDataPacket[]>("SELECT image FROM job_post WHERE id = ? AND juristic_id = ? AND status <> 'hidden'", [id, juristicId]);
    if (!old) return;
    await dbQuery("UPDATE job_post SET image = ? WHERE id = ?", [image, id]);
    if (old.image && old.image !== image) await deleteStored("public", old.image);
  }
  await dbQuery(
    `UPDATE job_post SET title = ?, employment_type = ?, province = ?, location = ?, salary_min = ?, salary_max = ?, salary_note = ?,
       positions = ?, description = ?, qualifications = ?, benefits = ?, contact_name = ?, contact_phone = ?, contact_email = ?,
       contact_line = ?, valid_through = ? WHERE id = ? AND juristic_id = ? AND status <> 'hidden'`,
    [j.title, j.employmentType, j.province, j.location, j.salaryMin, j.salaryMax, j.salaryNote, j.positions, j.description,
      j.qualifications, j.benefits, j.contactName, j.contactPhone, j.contactEmail, j.contactLine, j.validThrough, id, juristicId],
  );
}

/** บริษัทปิดรับ/เปิดรับเอง (ประกาศที่ผู้ดูแลซ่อนแล้วแก้ไม่ได้) */
export async function setJobOpen(id: number, juristicId: string, open: boolean): Promise<void> {
  await dbQuery(`UPDATE job_post SET status = ? WHERE id = ? AND juristic_id = ? AND status <> 'hidden'`, [open ? "active" : "closed", id, juristicId]);
}

export async function adminSetJobHidden(id: number, hidden: boolean): Promise<string | null> {
  await dbQuery(`UPDATE job_post SET status = ? WHERE id = ?`, [hidden ? "hidden" : "active", id]);
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT juristic_id FROM job_post WHERE id = ?`, [id]);
  return r ? String(r.juristic_id) : null;
}

export async function getJob(id: number): Promise<JobPost | null> {
  const [r] = await dbQuery<RowDataPacket[]>(`${JOB_SELECT} WHERE p.id = ?`, [id]);
  return r ? toJob(r) : null;
}

export async function listCompanyJobs(juristicId: string, onlyLive: boolean): Promise<JobPost[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `${JOB_SELECT} WHERE p.juristic_id = ? ${onlyLive ? "AND p.status = 'active' AND p.valid_through >= CURDATE()" : ""}
     ORDER BY p.created_at DESC LIMIT 100`,
    [juristicId],
  );
  return rows.map(toJob);
}

export async function searchJobs(f: { q?: string; province?: string; type?: string }, page: number, size = 30) {
  const where = ["p.status = 'active'", "p.valid_through >= CURDATE()", "(cp.hidden IS NULL OR cp.hidden = 0)"];
  const params: unknown[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push("(p.title LIKE ? OR p.description LIKE ? OR j.name_th LIKE ?)");
    params.push(like, like, like);
  }
  if (f.province) (where.push("p.province = ?"), params.push(f.province));
  if (isEmploymentType(f.type)) (where.push("p.employment_type = ?"), params.push(f.type));
  const w = where.join(" AND ");
  const [rows, count] = await Promise.all([
    dbQuery<RowDataPacket[]>(`${JOB_SELECT} WHERE ${w} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [...params, size, (page - 1) * size]),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) n FROM job_post p LEFT JOIN juristic j ON j.id = p.juristic_id LEFT JOIN company_profile cp ON cp.juristic_id = p.juristic_id WHERE ${w}`,
      params,
    ),
  ]);
  return { rows: rows.map(toJob), total: Number(count[0]?.n ?? 0) };
}

/** ทุกประกาศ (หลังบ้าน) */
export async function listAllJobs(status: string, page = 1, size = 50) {
  const where = ["active", "closed", "hidden"].includes(status) ? "WHERE p.status = ?" : "";
  const params = where ? [status] : [];
  const rows = await dbQuery<RowDataPacket[]>(`${JOB_SELECT} ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`, [...params, size, (page - 1) * size]);
  return rows.map(toJob);
}

export async function listLiveJobIds(): Promise<Array<{ id: number; updatedAt: string }>> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT id, updated_at FROM job_post WHERE status = 'active' AND valid_through >= CURDATE() ORDER BY id DESC LIMIT 50000`,
  );
  return rows.map((r) => ({ id: Number(r.id), updatedAt: String(r.updated_at) }));
}

/* ---------------------------------------------------------------- ข่าวสาร */

export interface NewsPost {
  id: number;
  juristicId: string;
  companyName: string | null;
  companyLogo: string | null;
  title: string;
  body: string;
  image: string | null;
  status: "published" | "hidden";
  createdAt: string;
  updatedAt: string;
}

const NEWS_SELECT = `SELECT p.*, j.name_th company_name, cp.logo company_logo FROM news_post p
  LEFT JOIN juristic j ON j.id = p.juristic_id LEFT JOIN company_profile cp ON cp.juristic_id = p.juristic_id`;

function toNews(r: RowDataPacket): NewsPost {
  return {
    id: Number(r.id), juristicId: r.juristic_id, companyName: r.company_name ?? null, companyLogo: r.company_logo ?? null,
    title: r.title, body: r.body, image: r.image, status: r.status, createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  };
}

export async function createNews(juristicId: string, userId: number, n: { title: string; body: string; image: string | null }): Promise<number> {
  const r = await dbQuery<ResultSetHeader>(
    `INSERT INTO news_post (juristic_id, title, body, image, created_by) VALUES (?, ?, ?, ?, ?)`,
    [juristicId, n.title, n.body, n.image, userId],
  );
  return r.insertId;
}

export async function updateNews(id: number, juristicId: string, n: { title: string; body: string; image?: string | null }): Promise<void> {
  const old = await getNews(id);
  if (!old || old.juristicId !== juristicId || old.status === "hidden") return;
  await dbQuery(`UPDATE news_post SET title = ?, body = ?, image = ? WHERE id = ?`, [
    n.title, n.body, n.image === undefined ? old.image : n.image, id,
  ]);
  if (n.image !== undefined && old.image && old.image !== n.image) await deleteStored("public", old.image);
}

export async function deleteNews(id: number, juristicId: string): Promise<void> {
  const old = await getNews(id);
  if (!old || old.juristicId !== juristicId) return;
  // ลบออกจากการแสดงผล แต่เก็บแถวไว้นับโควตาเดือนนี้
  await dbQuery(`UPDATE news_post SET status = 'hidden', image = NULL WHERE id = ?`, [id]);
  await deleteStored("public", old.image);
}

export async function adminSetNewsHidden(id: number, hidden: boolean): Promise<string | null> {
  await dbQuery(`UPDATE news_post SET status = ? WHERE id = ?`, [hidden ? "hidden" : "published", id]);
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT juristic_id FROM news_post WHERE id = ?`, [id]);
  return r ? String(r.juristic_id) : null;
}

export async function getNews(id: number): Promise<NewsPost | null> {
  const [r] = await dbQuery<RowDataPacket[]>(`${NEWS_SELECT} WHERE p.id = ?`, [id]);
  return r ? toNews(r) : null;
}

export async function listCompanyNews(juristicId: string, onlyPublished: boolean, limit = 50): Promise<NewsPost[]> {
  const rows = await dbQuery<RowDataPacket[]>(
    `${NEWS_SELECT} WHERE p.juristic_id = ? ${onlyPublished ? "AND p.status = 'published'" : ""} ORDER BY p.created_at DESC LIMIT ?`,
    [juristicId, limit],
  );
  return rows.map(toNews);
}

export async function listNews(page: number, size = 20) {
  const w = "p.status = 'published' AND (cp.hidden IS NULL OR cp.hidden = 0)";
  const [rows, count] = await Promise.all([
    dbQuery<RowDataPacket[]>(`${NEWS_SELECT} WHERE ${w} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [size, (page - 1) * size]),
    dbQuery<RowDataPacket[]>(
      `SELECT COUNT(*) n FROM news_post p LEFT JOIN company_profile cp ON cp.juristic_id = p.juristic_id WHERE ${w}`,
    ),
  ]);
  return { rows: rows.map(toNews), total: Number(count[0]?.n ?? 0) };
}

export async function listAllNews(status: string, page = 1, size = 50) {
  const where = ["published", "hidden"].includes(status) ? "WHERE p.status = ?" : "";
  const rows = await dbQuery<RowDataPacket[]>(`${NEWS_SELECT} ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`, [
    ...(where ? [status] : []), size, (page - 1) * size,
  ]);
  return rows.map(toNews);
}

export async function listPublishedNewsIds(): Promise<Array<{ id: number; updatedAt: string }>> {
  const rows = await dbQuery<RowDataPacket[]>(`SELECT id, updated_at FROM news_post WHERE status = 'published' ORDER BY id DESC LIMIT 50000`);
  return rows.map((r) => ({ id: Number(r.id), updatedAt: String(r.updated_at) }));
}

/** บริษัทที่ยืนยันแล้ว + ผู้ดูแล (หลังบ้าน) */
export async function listVerifiedCompanies(limit = 200) {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT m.juristic_id id, j.name_th name, m.user_id, u.email, m.created_at, COALESCE(cp.hidden, 0) hidden,
       (SELECT COUNT(*) FROM job_post p WHERE p.juristic_id = m.juristic_id) jobs,
       (SELECT COUNT(*) FROM news_post n WHERE n.juristic_id = m.juristic_id) news
     FROM company_member m LEFT JOIN juristic j ON j.id = m.juristic_id LEFT JOIN app_user u ON u.id = m.user_id
     LEFT JOIN company_profile cp ON cp.juristic_id = m.juristic_id ORDER BY m.created_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: String(r.id), name: r.name ? String(r.name) : null, userId: Number(r.user_id), email: r.email ? String(r.email) : "-",
    since: String(r.created_at), hidden: Number(r.hidden) === 1, jobs: Number(r.jobs), news: Number(r.news),
  }));
}
