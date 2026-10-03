"use server";
/**
 * Server Actions ของบัญชีบริษัท — ทุกฟังก์ชันตรวจว่า login และเป็นสมาชิกของบริษัทนั้นจริง (เรียกตรงด้วย POST ได้)
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  createClaim,
  createJob,
  createNews,
  deleteNews,
  getJob,
  getNews,
  isCompanyMember,
  isEmploymentType,
  JOB_DAYS_MAX,
  pendingClaimFor,
  postsThisMonth,
  quotas,
  saveProfile,
  setJobOpen,
  updateJob,
  updateNews,
  type JobInput,
} from "@/lib/business";
import { findJuristicById } from "@/lib/company-repo";
import { getCompany } from "@/lib/api";
import { SITE_URL } from "@/lib/format";
import { isValidJuristicId } from "@/lib/juristic-id";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { getSupportEmail } from "@/lib/settings";
import { cleanContact, publishContact, removeContact } from "@/lib/support";
import { deleteStored, MAX_CLAIM_TOTAL_BYTES, saveDocument, saveImage } from "@/lib/uploads";

const str = (f: FormData, k: string, max = 255) => String(f.get(k) ?? "").trim().slice(0, max);
const files = (f: FormData, k: string) => f.getAll(k).filter((x): x is File => x instanceof File && x.size > 0);

async function requireMember(juristicId: string) {
  const user = await requireUser(`/business/${juristicId}`);
  if (!isValidJuristicId(juristicId) || !(await isCompanyMember(user.id, juristicId))) redirect("/business?error=not-member");
  return user;
}

function refresh(juristicId: string) {
  revalidatePath(`/company/${juristicId}`);
  revalidatePath("/jobs");
  revalidatePath("/news");
}

/* ------------------------------------------------------------ ขอสิทธิ์บริษัท */

export async function submitClaim(formData: FormData) {
  const juristicId = str(formData, "juristicId", 20).replace(/\D/g, "");
  const back = (e: string) => redirect(`/business/claim?id=${juristicId}&error=${e}`);
  const user = await requireUser(`/business/claim?id=${juristicId}`);

  if (!isValidJuristicId(juristicId)) back("juristic");
  const exists = (await findJuristicById(juristicId).catch(() => null)) ?? (await getCompany(juristicId).catch(() => null));
  if (!exists) back("juristic");
  if (await isCompanyMember(user.id, juristicId)) redirect(`/business/${juristicId}`);
  if (await pendingClaimFor(user.id, juristicId)) back("pending");

  const contactName = str(formData, "contactName", 255);
  const phone = str(formData, "phone", 64);
  if (contactName.length < 2) back("name");
  if (!/^[0-9+\-\s()#]{6,40}$/.test(phone)) back("phone");
  if (formData.get("authority") !== "1" || formData.get("consent") !== "1") back("consent");

  const cert = files(formData, "certificate");
  const ids = files(formData, "identity");
  if (cert.length !== 1) back("certificate");
  if (ids.length < 1 || ids.length > 4) back("identity");
  if ([...cert, ...ids].reduce((s, f) => s + f.size, 0) > MAX_CLAIM_TOTAL_BYTES) back("file-total");

  const saved: string[] = [];
  for (const f of [...cert, ...ids]) {
    const r = await saveDocument(f);
    if ("error" in r) {
      for (const s of saved) await deleteStored("private", s);
      back(`file-${r.error}`);
    } else saved.push(r.name);
  }
  const id = await createClaim({ juristicId, userId: user.id, contactName, position: str(formData, "position", 100) || null, phone, docFiles: saved });

  if (isMailConfigured()) {
    await sendMail({
      to: await getSupportEmail(),
      subject: `[บัญชีบริษัท] คำขอใหม่ ${juristicId}`,
      text: `มีคำขอยืนยันบัญชีบริษัทใหม่\nนิติบุคคล: ${juristicId}\nผู้ยื่น: ${contactName} (${user.email}) โทร ${phone}\n\nตรวจเอกสารที่ ${SITE_URL}/admin/business/claims/${id}`,
    }).catch((e) => console.error("[business] notify failed:", e));
  }
  redirect("/business?ok=claimed");
}

/* ---------------------------------------------------------------- โปรไฟล์ */

export async function saveCompanyProfile(formData: FormData) {
  const juristicId = str(formData, "juristicId", 20);
  const user = await requireMember(juristicId);
  const back = (q: string) => redirect(`/business/${juristicId}?${q}#profile`);

  // ข้อมูลติดต่อ: ว่างทุกช่อง = เอาออก
  const contactRaw = {
    phone: str(formData, "phone", 64), email: str(formData, "email"), website: str(formData, "website"),
    lineId: str(formData, "lineId", 100), facebook: str(formData, "facebook"),
  };
  if (Object.values(contactRaw).some(Boolean)) {
    const c = cleanContact(contactRaw);
    if ("error" in c) back(`error=${c.error}`);
    else await publishContact(juristicId, c.contact, "owner");
  } else {
    await removeContact(juristicId);
  }

  let logo: string | null | undefined;
  const upload = files(formData, "logo")[0];
  if (upload) {
    const r = await saveImage(upload, "logo", 400);
    if ("error" in r) back(`error=logo-${r.error}`);
    else logo = r.name;
  } else if (formData.get("removeLogo") === "1") {
    logo = null;
  }
  await saveProfile(juristicId, user.id, {
    about: str(formData, "about", 3000) || null,
    services: str(formData, "services", 2000) || null,
    logo,
  });
  refresh(juristicId);
  back("ok=profile");
}

/* -------------------------------------------------------------- ประกาศงาน */

function parseJob(formData: FormData): JobInput | string {
  const title = str(formData, "title", 200);
  if (title.length < 4) return "title";
  const employmentType = str(formData, "employmentType", 20);
  if (!isEmploymentType(employmentType)) return "type";
  const province = str(formData, "province", 64);
  if (!province) return "province";
  const description = str(formData, "description", 5000);
  if (description.length < 20) return "description";
  const num = (k: string) => {
    const v = str(formData, k, 20).replace(/[,\s]/g, "");
    const n = Number(v);
    return v && Number.isInteger(n) && n >= 0 && n < 10_000_000 ? n : null;
  };
  const salaryMin = num("salaryMin");
  const salaryMax = num("salaryMax");
  if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) return "salary";
  const days = Math.min(JOB_DAYS_MAX, Math.max(7, Number(str(formData, "days", 3)) || 30));
  const validThrough = new Date(Date.now() + 7 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);
  const contactPhone = str(formData, "contactPhone", 64) || null;
  const contactEmail = str(formData, "contactEmail").toLowerCase() || null;
  const contactLine = str(formData, "contactLine", 100) || null;
  if (!contactPhone && !contactEmail && !contactLine) return "contact";
  if (contactEmail && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/.test(contactEmail)) return "contact";
  return {
    title, employmentType, province, location: str(formData, "location") || null, salaryMin, salaryMax,
    salaryNote: str(formData, "salaryNote", 100) || null,
    positions: Math.min(999, Math.max(1, Number(str(formData, "positions", 4)) || 1)),
    description, qualifications: str(formData, "qualifications", 3000) || null, benefits: str(formData, "benefits", 3000) || null,
    contactName: str(formData, "contactName") || null, contactPhone, contactEmail, contactLine, validThrough,
  };
}

export async function saveJob(formData: FormData) {
  const juristicId = str(formData, "juristicId", 20);
  const user = await requireMember(juristicId);
  const jobId = Number(str(formData, "jobId", 12)) || 0;
  const page = `/business/${juristicId}/jobs/${jobId || "new"}`;
  if (formData.get("rules") !== "1") redirect(`${page}?error=rules`);
  const j = parseJob(formData);
  if (typeof j === "string") redirect(`${page}?error=${j}`);

  let image: string | null | undefined;
  const upload = files(formData, "image")[0];
  if (upload) {
    const r = await saveImage(upload, "job", 1200);
    if ("error" in r) redirect(`${page}?error=image-${r.error}`);
    image = r.name;
  } else if (formData.get("removeImage") === "1") image = null;

  if (jobId) {
    const old = await getJob(jobId);
    if (!old || old.juristicId !== juristicId) {
      await deleteStored("public", image);
      redirect(`/business/${juristicId}?error=not-found#jobs`);
    }
    await updateJob(jobId, juristicId, j, image);
  } else {
    if ((await postsThisMonth("job_post", juristicId)) >= (await quotas()).jobs) {
      await deleteStored("public", image);
      redirect(`/business/${juristicId}?error=job-quota#jobs`);
    }
    const id = await createJob(juristicId, user.id, j, image ?? null);
    revalidatePath(`/jobs/${id}`);
  }
  if (jobId) revalidatePath(`/jobs/${jobId}`);
  refresh(juristicId);
  redirect(`/business/${juristicId}?ok=job#jobs`);
}

export async function toggleJob(formData: FormData) {
  const juristicId = str(formData, "juristicId", 20);
  await requireMember(juristicId);
  const jobId = Number(str(formData, "jobId", 12));
  await setJobOpen(jobId, juristicId, formData.get("open") === "1");
  revalidatePath(`/jobs/${jobId}`);
  refresh(juristicId);
  redirect(`/business/${juristicId}#jobs`);
}

/* ---------------------------------------------------------------- ข่าวสาร */

export async function saveNews(formData: FormData) {
  const juristicId = str(formData, "juristicId", 20);
  const user = await requireMember(juristicId);
  const newsId = Number(str(formData, "newsId", 12)) || 0;
  const page = `/business/${juristicId}/news/${newsId || "new"}`;
  if (formData.get("rules") !== "1") redirect(`${page}?error=rules`);
  const title = str(formData, "title", 200);
  const body = str(formData, "body", 10000);
  if (title.length < 4) redirect(`${page}?error=title`);
  if (body.length < 20) redirect(`${page}?error=body`);

  let image: string | null | undefined;
  const upload = files(formData, "image")[0];
  if (upload) {
    const r = await saveImage(upload, "news", 1200);
    if ("error" in r) redirect(`${page}?error=image-${r.error}`);
    image = r.name;
  } else if (formData.get("removeImage") === "1") image = null;

  if (newsId) {
    const old = await getNews(newsId);
    if (!old || old.juristicId !== juristicId) redirect(`/business/${juristicId}?error=not-found#news`);
    await updateNews(newsId, juristicId, { title, body, image });
    revalidatePath(`/news/${newsId}`);
  } else {
    if ((await postsThisMonth("news_post", juristicId)) >= (await quotas()).news) {
      await deleteStored("public", image);
      redirect(`/business/${juristicId}?error=news-quota#news`);
    }
    await createNews(juristicId, user.id, { title, body, image: image ?? null });
  }
  refresh(juristicId);
  redirect(`/business/${juristicId}?ok=news#news`);
}

export async function removeNewsPost(formData: FormData) {
  const juristicId = str(formData, "juristicId", 20);
  await requireMember(juristicId);
  const newsId = Number(str(formData, "newsId", 12));
  await deleteNews(newsId, juristicId);
  revalidatePath(`/news/${newsId}`);
  refresh(juristicId);
  redirect(`/business/${juristicId}?ok=news-deleted#news`);
}
