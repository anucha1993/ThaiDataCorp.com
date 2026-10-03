/**
 * ติดต่อเรา / คำร้อง — แก้ไขข้อมูล, เพิ่มข้อมูลติดต่อของกิจการ, ลบข้อมูลส่วนบุคคล (PDPA), แจ้งปัญหา, ร้องเรียน
 * ทุกคำร้องได้เลขที่ (ticket) และติดตามสถานะได้ · ข้อมูลติดต่อเผยแพร่เฉพาะหลังผู้ดูแลตรวจสอบ
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { dbQuery } from "@/lib/db";

export const REQUEST_TYPES = {
  correction: { label: "แจ้งแก้ไขข้อมูลไม่ถูกต้อง", needsCompany: true, help: "ระบุข้อมูลที่ไม่ถูกต้องและข้อมูลที่ถูกต้อง พร้อมแหล่งอ้างอิง (ถ้ามี)" },
  contact: { label: "เพิ่ม / แก้ไขข้อมูลติดต่อของกิจการ", needsCompany: true, help: "สำหรับเจ้าของกิจการ กรรมการ หรือพนักงานที่ได้รับมอบหมาย — เผยแพร่หลังตรวจสอบ" },
  removal: { label: "ขอลบ / ระงับข้อมูลส่วนบุคคล (PDPA)", needsCompany: false, help: "ระบุหน้าและข้อมูลที่ต้องการให้ลบ เราจะดำเนินการภายใน 30 วัน" },
  bug: { label: "แจ้งปัญหาการใช้งานเว็บไซต์", needsCompany: false, help: "บอกหน้าที่พบปัญหา สิ่งที่ทำ และสิ่งที่เกิดขึ้น" },
  complaint: { label: "ร้องเรียน", needsCompany: false, help: "เรื่องที่ต้องการร้องเรียนและรายละเอียด" },
  business: { label: "ติดต่อธุรกิจ / ขอใช้ข้อมูล / API", needsCompany: false, help: "บอกความต้องการและช่องทางติดต่อกลับ" },
  feedback: { label: "ข้อเสนอแนะ / อื่น ๆ", needsCompany: false, help: "" },
} as const;
export type RequestType = keyof typeof REQUEST_TYPES;

export const REQUEST_STATUS = {
  new: { label: "รับเรื่องแล้ว", cls: "border-blue-700 text-blue-800" },
  in_progress: { label: "กำลังดำเนินการ", cls: "border-amber-700 text-amber-800" },
  resolved: { label: "ดำเนินการแล้ว", cls: "border-green-700 text-green-800" },
  rejected: { label: "ไม่ดำเนินการ", cls: "border-wiki-border text-wiki-muted" },
} as const;
export type RequestStatus = keyof typeof REQUEST_STATUS;

export const RELATIONS = {
  owner: "เจ้าของกิจการ / กรรมการ",
  employee: "พนักงานที่ได้รับมอบหมาย",
  person: "บุคคลที่ปรากฏชื่อในข้อมูล",
  public: "บุคคลทั่วไป",
} as const;

export interface ContactInfo {
  phone?: string;
  email?: string;
  website?: string;
  lineId?: string;
  facebook?: string;
}

export const isRequestType = (t: unknown): t is RequestType => typeof t === "string" && t in REQUEST_TYPES;
export const isRequestStatus = (s: unknown): s is RequestStatus => typeof s === "string" && s in REQUEST_STATUS;

export const hashIp = (ip: string) => createHash("sha256").update(`tdc:${ip}`).digest("hex");

/** ตรวจ/ทำความสะอาดข้อมูลติดต่อที่ส่งมา — คืน error ถ้ารูปแบบไม่ถูกต้อง */
export function cleanContact(raw: Record<string, string>): { contact: ContactInfo } | { error: string } {
  const c: ContactInfo = {};
  const phone = raw.phone?.trim();
  if (phone) {
    if (!/^[0-9+\-\s()#,]{6,40}$/.test(phone)) return { error: "contact-phone" };
    c.phone = phone.replace(/\s+/g, " ");
  }
  const email = raw.email?.trim().toLowerCase();
  if (email) {
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/.test(email)) return { error: "contact-email" };
    c.email = email;
  }
  for (const k of ["website", "facebook"] as const) {
    let v = raw[k]?.trim();
    if (!v) continue;
    if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
    try {
      const u = new URL(v);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error();
      if (k === "facebook" && !/(^|\.)facebook\.com$|(^|\.)fb\.com$/i.test(u.hostname)) return { error: "contact-facebook" };
      c[k] = u.toString().slice(0, 255);
    } catch {
      return { error: `contact-${k}` };
    }
  }
  const line = raw.lineId?.trim();
  if (line) {
    if (!/^@?[a-z0-9._-]{2,50}$/i.test(line)) return { error: "contact-line" };
    c.lineId = line;
  }
  if (Object.keys(c).length === 0) return { error: "contact-empty" };
  return { contact: c };
}

/** คำร้องจาก IP เดียวกันใน 1 ชั่วโมง (กันสแปม) */
export async function recentRequestCount(ipHash: string, email: string): Promise<number> {
  const [r] = await dbQuery<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM support_request WHERE (ip_hash = ? OR email = ?) AND created_at > NOW() - INTERVAL 1 HOUR`,
    [ipHash, email],
  );
  return Number(r?.n ?? 0);
}

function newTicket(): string {
  const d = new Date(Date.now() + 7 * 3600_000); // เวลาไทย
  const ymd = `${String(d.getUTCFullYear() + 543).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ไม่มี 0/O/1/I กันอ่านผิด
  const rand = [...randomBytes(4)].map((b) => alphabet[b % alphabet.length]).join("");
  return `TDC-${ymd}-${rand}`;
}

export async function createRequest(r: {
  type: RequestType;
  juristicId: string | null;
  pageUrl: string | null;
  name: string;
  email: string;
  phone: string | null;
  relation: string | null;
  subject: string | null;
  message: string;
  contact: ContactInfo | null;
  userId: number | null;
  ipHash: string;
}): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const ticket = newTicket();
    try {
      await dbQuery(
        `INSERT INTO support_request (ticket, type, juristic_id, page_url, name, email, phone, relation, subject, message, contact_json, user_id, ip_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ticket, r.type, r.juristicId, r.pageUrl, r.name, r.email, r.phone, r.relation, r.subject, r.message,
          r.contact ? JSON.stringify(r.contact) : null, r.userId, r.ipHash],
      );
      return ticket;
    } catch (e) {
      if ((e as { code?: string }).code !== "ER_DUP_ENTRY") throw e;
    }
  }
  throw new Error("could not allocate ticket");
}

export interface SupportRequest {
  id: number;
  ticket: string;
  type: RequestType;
  status: RequestStatus;
  juristicId: string | null;
  companyName: string | null;
  pageUrl: string | null;
  name: string;
  email: string;
  phone: string | null;
  relation: string | null;
  subject: string | null;
  message: string;
  contact: ContactInfo | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

function toRequest(r: RowDataPacket): SupportRequest {
  let contact: ContactInfo | null = null;
  try {
    contact = r.contact_json ? JSON.parse(r.contact_json) : null;
  } catch {
    /* ignore */
  }
  return {
    id: Number(r.id), ticket: r.ticket, type: r.type, status: r.status, juristicId: r.juristic_id, companyName: r.company_name ?? null,
    pageUrl: r.page_url, name: r.name, email: r.email, phone: r.phone, relation: r.relation, subject: r.subject, message: r.message,
    contact, adminNote: r.admin_note, createdAt: String(r.created_at), updatedAt: String(r.updated_at),
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
  };
}

const SELECT = `SELECT s.*, j.name_th company_name FROM support_request s LEFT JOIN juristic j ON j.id = s.juristic_id`;

export async function listRequests(f: { status?: string; type?: string; q?: string }, page: number, pageSize = 50) {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (isRequestStatus(f.status)) (where.push("s.status = ?"), params.push(f.status));
  if (isRequestType(f.type)) (where.push("s.type = ?"), params.push(f.type));
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push("(s.ticket LIKE ? OR s.email LIKE ? OR s.name LIKE ? OR s.juristic_id LIKE ? OR s.message LIKE ?)");
    params.push(like, like, like, like, like);
  }
  const [rows, count] = await Promise.all([
    dbQuery<RowDataPacket[]>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY s.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]),
    dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM support_request s WHERE ${where.join(" AND ")}`, params),
  ]);
  return { rows: rows.map(toRequest), total: Number(count[0]?.n ?? 0) };
}

export async function countOpenRequests(): Promise<number> {
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT COUNT(*) n FROM support_request WHERE status IN ('new', 'in_progress')`);
  return Number(r?.n ?? 0);
}

export async function getRequest(id: number): Promise<SupportRequest | null> {
  const [r] = await dbQuery<RowDataPacket[]>(`${SELECT} WHERE s.id = ?`, [id]);
  return r ? toRequest(r) : null;
}

/** ผู้ส่งติดตามสถานะ — ต้องรู้ทั้งเลขที่คำร้องและอีเมลที่ใช้ส่ง */
export async function findRequestForRequester(ticket: string, email: string): Promise<SupportRequest | null> {
  const [r] = await dbQuery<RowDataPacket[]>(`${SELECT} WHERE s.ticket = ? AND s.email = ?`, [ticket.trim().toUpperCase(), email.trim().toLowerCase()]);
  return r ? toRequest(r) : null;
}

export async function updateRequest(id: number, status: RequestStatus, adminNote: string | null): Promise<void> {
  await dbQuery(
    `UPDATE support_request SET status = ?, admin_note = ?,
       resolved_at = IF(? IN ('resolved', 'rejected'), COALESCE(resolved_at, NOW()), NULL) WHERE id = ?`,
    [status, adminNote, status, id],
  );
}

/* ------------------------------------------------- ข้อมูลติดต่อของกิจการ */

export async function getJuristicContact(id: string): Promise<(ContactInfo & { verifiedAt: string }) | null> {
  const [r] = await dbQuery<RowDataPacket[]>(`SELECT * FROM juristic_contact WHERE juristic_id = ?`, [id]);
  if (!r) return null;
  return {
    phone: r.phone ?? undefined, email: r.email ?? undefined, website: r.website ?? undefined,
    lineId: r.line_id ?? undefined, facebook: r.facebook ?? undefined, verifiedAt: String(r.verified_at),
  };
}

export async function publishContact(juristicId: string, c: ContactInfo, ticket: string): Promise<void> {
  await dbQuery(
    `INSERT INTO juristic_contact (juristic_id, phone, email, website, line_id, facebook, source_ticket, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE phone = VALUES(phone), email = VALUES(email), website = VALUES(website),
       line_id = VALUES(line_id), facebook = VALUES(facebook), source_ticket = VALUES(source_ticket), verified_at = NOW()`,
    [juristicId, c.phone ?? null, c.email ?? null, c.website ?? null, c.lineId ?? null, c.facebook ?? null, ticket],
  );
}

export async function removeContact(juristicId: string): Promise<void> {
  await dbQuery<ResultSetHeader>(`DELETE FROM juristic_contact WHERE juristic_id = ?`, [juristicId]);
}
