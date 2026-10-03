/**
 * Data layer ของ ThaiDataCorp — ดึงข้อมูลนิติบุคคลจาก GDX (api.egov.go.th)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * การตั้งค่า CONSUMER_KEY สำหรับใช้งานจริง (ThaiDataCorp.com)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. คัดลอกไฟล์ตัวอย่าง:   cp .env.example .env.local
 * 2. ใส่ค่าที่ได้จาก GDX ใน .env.local:
 *
 *      GDX_CONSUMER_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *      GDX_CONSUMER_SECRET=xxxxxxxxxxxxxxxx
 *      GDX_AGENT_ID=1234567890123        # เลขบัตรประชาชนผู้รับผิดชอบที่ลงทะเบียนกับ GDX
 *      NEXT_PUBLIC_SITE_URL=https://thaidatacorp.com
 *
 * 3. บน Production (เช่น Vercel) ให้ใส่ตัวแปรชุดเดียวกันที่ Project Settings → Environment Variables
 *    แล้ว redeploy — ไม่ต้องใช้ไฟล์ .env.local บนเซิร์ฟเวอร์
 * 4. รีสตาร์ท `npm run dev` ทุกครั้งที่แก้ .env.local
 *
 * Flow การยืนยันตัวตนของ GDX:
 *   GET {GDX_BASE_URL}/ws/auth/validate?ConsumerSecret=...&AgentID=...
 *       Header: Consumer-Key: <GDX_CONSUMER_KEY>
 *       → { "Result": "<token>" }
 *   GET {GDX_BASE_URL}/ws/dbd/juristic/v4/profile?JuristicID=<13 หลัก>
 *       Header: Consumer-Key: <GDX_CONSUMER_KEY>, Token: <token>
 *
 * ถ้าไม่ได้ตั้ง GDX_CONSUMER_KEY แต่ตั้ง OPEND_API_KEY ระบบจะใช้ Open-D (lib/opend.ts) แทน
 * ถ้าไม่ได้ตั้งทั้งสองค่า ระบบจะใช้ Mock Data (lib/mock-data.ts) อัตโนมัติ
 * ถ้าตั้งคีย์แล้วแต่ API ล่ม ระบบจะ throw error (ไม่ fallback เป็น mock)
 * เพื่อไม่ให้ข้อมูลปลอมถูกแสดงหรือถูก index บน Production
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "server-only";
import { cache } from "react";
import { normalizeProfile } from "@/lib/dbd-normalize";
import { fetchDbdJuristic, isDbdOpenApiEnabled } from "@/lib/dbd-openapi";
import { MOCK_COMPANIES } from "@/lib/mock-data";
import {
  countJuristic,
  findCompanyDetails,
  findJuristicById,
  findSameAddress,
  listJuristicForSitemap,
  listRecentJuristic,
  searchJuristicByName,
  SITEMAP_CHUNK_SIZE,
  upsertDbdProfile,
} from "@/lib/company-repo";
import { isDbConfigured } from "@/lib/db";
import { getPriceEqualsReference, getProcurementForCompany } from "@/lib/procurement-repo";
import { computeSignals } from "@/lib/signals";
import { getOpendProfile, isOpendEnabled, listOpendIds, listRecentOpend, searchOpendByName } from "@/lib/opend";
import type {
  CompanyData,
  DbdRawJuristicPerson,
  DbdRawProfileResponse,
  DirectorsApiResponse,
  FinancialsApiResponse,
  GdxAuthResponse,
  JuristicProfile,
} from "@/types/company";

/* -------------------------------------------------------------------------- */
/*                                   Config                                   */
/* -------------------------------------------------------------------------- */

/** ข้อมูลนิติบุคคลเปลี่ยนไม่บ่อย cache ไว้ 24 ชม. (ตรงกับ revalidate ของหน้าเพจ) */
export const DATA_REVALIDATE_SECONDS = 86_400;
/** Token ของ GDX มีอายุจำกัด cache ไว้สั้นกว่าอายุจริงเพื่อความปลอดภัย */
const TOKEN_REVALIDATE_SECONDS = 1_500;
const REQUEST_TIMEOUT_MS = 10_000;

const config = {
  baseUrl: (process.env.GDX_BASE_URL ?? "https://api.egov.go.th").replace(/\/+$/, ""),
  authPath: process.env.GDX_AUTH_PATH ?? "/ws/auth/validate",
  profilePath: process.env.GDX_DBD_PROFILE_PATH ?? "/ws/dbd/juristic/v4/profile",
  consumerKey: process.env.GDX_CONSUMER_KEY?.trim() ?? "",
  consumerSecret: process.env.GDX_CONSUMER_SECRET?.trim() ?? "",
  agentId: process.env.GDX_AGENT_ID?.trim() ?? "",
  directorsUrl: process.env.DIRECTORS_API_URL?.trim() ?? "",
  financialsUrl: process.env.FINANCIALS_API_URL?.trim() ?? "",
  internalToken: process.env.INTERNAL_API_TOKEN?.trim() ?? "",
};

/** ช่องทางที่เว็บใช้อ่านข้อมูล (ต่างจาก CompanyData.source ซึ่งบอกว่าข้อมูลมาจากแหล่งใด) */
export type Provider = "gdx" | "db" | "opend" | "mock";

/**
 * เลือกช่องทางอ่านข้อมูลตามค่าที่ตั้งไว้ (ลำดับความสำคัญ):
 *   1. GDX_CONSUMER_KEY → GDX (ข้อมูลครบทุกนิติบุคคล)
 *   2. DB_HOST ...      → MySQL ของเราเอง (ข้อมูล Open-D ที่ sync ด้วย `npm run sync`)
 *   3. OPEND_API_KEY    → เรียก Open-D API ตรง (ช้ากว่า ใช้ระหว่างยังไม่มี DB)
 *   4. ไม่มีเลย          → Mock Data
 */
export function getProvider(): Provider {
  if (config.consumerKey !== "") return "gdx";
  if (isDbConfigured()) return "db";
  if (isOpendEnabled()) return "opend";
  return "mock";
}

/** true เมื่อไม่มีแหล่งข้อมูลใดเลย → ใช้ Mock Data */
export function isMockMode(): boolean {
  return getProvider() === "mock";
}

export class GdxApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GdxApiError";
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

import { isNonDbdTaxId, isValidJuristicId } from "@/lib/juristic-id";
export { isValidJuristicId, normalizeJuristicIdInput } from "@/lib/juristic-id";

/* -------------------------------------------------------------------------- */
/*                                 HTTP helpers                               */
/* -------------------------------------------------------------------------- */

async function fetchJson<T>(url: string, init: RequestInit & { next?: NextFetchRequestConfig }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new GdxApiError(`Request failed: ${res.status} ${res.statusText} (${new URL(url).pathname})`, res.status);
  }
  return (await res.json()) as T;
}

/**
 * ขอ Token จาก GDX
 * @param bust ใส่ query สุ่มเพื่อข้าม Data Cache เมื่อ token เดิมหมดอายุ (401)
 */
async function getGdxToken(bust = false): Promise<string> {
  const url = new URL(config.baseUrl + config.authPath);
  url.searchParams.set("ConsumerSecret", config.consumerSecret);
  url.searchParams.set("AgentID", config.agentId);
  if (bust) url.searchParams.set("_", Date.now().toString(36));

  const data = await fetchJson<GdxAuthResponse>(url.toString(), {
    headers: { "Consumer-Key": config.consumerKey },
    next: { revalidate: TOKEN_REVALIDATE_SECONDS },
  });
  if (!data.Result) {
    throw new GdxApiError(`GDX auth failed: ${data.Message ?? "no token returned"}`);
  }
  return data.Result;
}

/** เรียก GDX พร้อม Consumer-Key + Token และลองใหม่ 1 ครั้งเมื่อ token หมดอายุ */
async function gdxGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(config.baseUrl + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const call = async (token: string) =>
    fetchJson<T>(url.toString(), {
      headers: { "Consumer-Key": config.consumerKey, Token: token },
      next: { revalidate: DATA_REVALIDATE_SECONDS },
    });

  try {
    return await call(await getGdxToken());
  } catch (err) {
    if (err instanceof GdxApiError && (err.status === 401 || err.status === 403)) {
      return call(await getGdxToken(true));
    }
    throw err;
  }
}

/** เรียก API ภายใน (กรรมการ/งบการเงิน) — url ใช้ {id} เป็น placeholder */
async function internalGet<T>(template: string, id: string): Promise<T> {
  return fetchJson<T>(template.replace("{id}", encodeURIComponent(id)), {
    headers: config.internalToken ? { Authorization: `Bearer ${config.internalToken}` } : {},
    next: { revalidate: DATA_REVALIDATE_SECONDS },
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Normalizers                                */
/* -------------------------------------------------------------------------- */

// normalizeProfile / mapStatus อยู่ใน lib/dbd-normalize.ts (ใช้ร่วมกับ DBD Open API และสคริปต์)
export { normalizeProfile } from "@/lib/dbd-normalize";

function firstJuristicPerson(res: DbdRawProfileResponse): DbdRawJuristicPerson | null {
  return res.ResultList?.[0]?.["cd:OrganizationJuristicPerson"] ?? null;
}

/* -------------------------------------------------------------------------- */
/*                                 Data sources                               */
/* -------------------------------------------------------------------------- */

async function fetchLiveCompany(id: string): Promise<CompanyData | null> {
  const emptyPeople: DirectorsApiResponse = { directors: [], shareholders: [] };
  const emptyFinancials: FinancialsApiResponse = { financials: [] };

  // ข้อมูลเสริมดึงพร้อมกัน และไม่ทำให้ทั้งหน้าพังถ้าแหล่งเสริมล่ม
  const [profileRes, peopleRes, financialRes] = await Promise.all([
    gdxGet<DbdRawProfileResponse>(config.profilePath, { JuristicID: id }),
    config.directorsUrl
      ? internalGet<DirectorsApiResponse>(config.directorsUrl, id).catch((e) => {
          console.error(`[api] directors(${id}) failed:`, e);
          return emptyPeople;
        })
      : Promise.resolve(emptyPeople),
    config.financialsUrl
      ? internalGet<FinancialsApiResponse>(config.financialsUrl, id).catch((e) => {
          console.error(`[api] financials(${id}) failed:`, e);
          return emptyFinancials;
        })
      : Promise.resolve(emptyFinancials),
  ]);

  const raw = firstJuristicPerson(profileRes);
  if (!raw) return null;

  return buildCompanyData(normalizeProfile(raw), peopleRes, financialRes, "gdx");
}

/**
 * Open-D (จาก DB หรือ API) มีเฉพาะข้อมูลทะเบียน — ส่วนกรรมการ/งบการเงินดึงจาก API ภายในได้ถ้าตั้งไว้
 */
async function fetchOpendCompany(id: string, from: "db" | "api"): Promise<CompanyData | null> {
  // ข้อมูลกรรมการ/ผู้ถือหุ้น/งบการเงิน: ใช้ API ภายในถ้าตั้งไว้ ไม่เช่นนั้นอ่านจากตาราง juristic_* ใน DB
  if (from === "db" && !config.directorsUrl && !config.financialsUrl) {
    const soft = <T,>(label: string, p: Promise<T>, fallback: T) =>
      p.catch((e) => {
        console.error(`[api] ${label}(${id}) failed:`, e);
        return fallback;
      });
    const [profile, details, procurement, sameAddress, priceEqualsRef] = await Promise.all([
      findInDbOrDbd(id),
      findCompanyDetails(id),
      soft("procurement", getProcurementForCompany(id), null),
      soft("sameAddress", findSameAddress(id), null),
      soft("priceEqualsRef", getPriceEqualsReference(id), { competitive: 0, equal: 0 }),
    ]);
    if (!profile) return null;
    const signals = computeSignals({
      profile,
      procurement,
      priceEqualsRef,
      sameAddressTotal: sameAddress?.total,
      sameAddressWithGov: sameAddress?.companies.filter((c) => c.govContracts > 0).length,
    });
    return { ...buildCompanyData(profile, details, details, "opend"), procurement, sameAddress, signals };
  }

  const [profile, people, fin] = await Promise.all([
    from === "db" ? findInDbOrDbd(id) : getOpendProfile(id),
    config.directorsUrl
      ? internalGet<DirectorsApiResponse>(config.directorsUrl, id).catch(() => ({ directors: [], shareholders: [] }))
      : Promise.resolve<DirectorsApiResponse>({ directors: [], shareholders: [] }),
    config.financialsUrl
      ? internalGet<FinancialsApiResponse>(config.financialsUrl, id).catch(() => ({ financials: [] }))
      : Promise.resolve<FinancialsApiResponse>({ financials: [] }),
  ]);
  return profile ? buildCompanyData(profile, people, fin, "opend") : null;
}

/**
 * อ่านจาก DB ก่อน — ถ้าไม่มี (เช่น บริษัทที่จดทะเบียนก่อนปี 2565 และยังไม่เลิก ซึ่งไม่อยู่ในชุด Open-D)
 * ให้ดึงจาก DBD Open API แล้วบันทึกลง DB (cache-aside) ครั้งต่อไปจะอ่านจาก DB ทันที
 */
async function findInDbOrDbd(id: string): Promise<JuristicProfile | null> {
  const fromDb = await findJuristicById(id);
  if (fromDb || !isDbdOpenApiEnabled() || isNonDbdTaxId(id)) return fromDb;

  // throw ต่อเมื่อ DBD ล่ม/โดน WAF → หน้า error (ไม่ cache เป็น 404 ผิด ๆ)
  const raw = await fetchDbdJuristic(id, { revalidate: DATA_REVALIDATE_SECONDS });
  if (!raw) return null;
  const profile = normalizeProfile(raw);
  await upsertDbdProfile(profile).catch((e) => console.error(`[api] save DBD profile ${id} failed:`, e));
  return profile;
}

function fetchMockCompany(id: string): CompanyData | null {
  const mock = MOCK_COMPANIES[id];
  const raw = mock && firstJuristicPerson(mock.profile);
  if (!mock || !raw) return null;
  return buildCompanyData(normalizeProfile(raw), mock.people, mock.financials, "mock");
}

function buildCompanyData(
  profile: JuristicProfile,
  people: DirectorsApiResponse,
  fin: FinancialsApiResponse,
  source: CompanyData["source"],
): CompanyData {
  return {
    profile,
    directors: [...(people.directors ?? [])].sort((a, b) => a.order - b.order),
    shareholders: [...(people.shareholders ?? [])].sort((a, b) => b.percent - a.percent),
    authorizedSignatory: people.authorizedSignatory,
    financials: [...(fin.financials ?? [])].sort((a, b) => b.fiscalYear - a.fiscalYear),
    source,
    fetchedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Public API                                 */
/* -------------------------------------------------------------------------- */

/**
 * ดึงข้อมูลบริษัทครบชุด — คืน null เมื่อเลขไม่ถูกต้องหรือไม่พบข้อมูล
 * ห่อด้วย React cache() ให้ generateMetadata และ Page ใช้ผลลัพธ์เดียวกันใน request เดียว
 */
export const getCompany = cache(async (id: string): Promise<CompanyData | null> => {
  if (!isValidJuristicId(id)) return null;
  switch (getProvider()) {
    case "gdx":
      return fetchLiveCompany(id);
    case "db":
      return fetchOpendCompany(id, "db");
    case "opend":
      return fetchOpendCompany(id, "api");
    default:
      return fetchMockCompany(id);
  }
});

/**
 * ค้นหาด้วยชื่อ
 * - DB:     LIKE ในข้อมูลทั้งหมดที่ sync ไว้
 * - Open-D: full-text ในชุดนิติบุคคลตั้งใหม่ 12 เดือนล่าสุด
 * - GDX:    ไม่มี endpoint ค้นหาตามชื่อ → ต้องต่อ search index ของคุณเอง (คืนค่าว่าง)
 * - Mock:   ค้นในข้อมูลตัวอย่าง
 */
export async function searchCompaniesByName(query: string): Promise<JuristicProfile[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const provider = getProvider();
  if (provider === "db") return searchJuristicByName(query.trim());
  if (provider === "opend") return searchOpendByName(query.trim());
  if (provider === "gdx") return [];
  return Object.keys(MOCK_COMPANIES)
    .map((id) => fetchMockCompany(id)?.profile)
    .filter((p): p is JuristicProfile => !!p)
    .filter((p) => p.nameTh.toLowerCase().includes(q) || p.nameEn?.toLowerCase().includes(q));
}

/**
 * จำนวนไฟล์ sitemap ของหน้าบริษัท (ไฟล์ละ ≤ 50,000 URL)
 * - DB:     ทุกนิติบุคคลในตาราง
 * - Open-D: ไฟล์เดียว (นิติบุคคลตั้งใหม่ 6 เดือนล่าสุด)
 * - GDX / Mock: ไม่มีรายการ (GDX ไม่มี endpoint แสดงรายการทั้งหมด, หน้า mock เป็น noindex)
 */
export async function getCompanySitemapCount(): Promise<number> {
  if (getProvider() !== "db") return 1;
  const total = await countJuristic().catch((e) => {
    console.error("[api] sitemap count failed:", e);
    return 0;
  });
  return Math.max(1, Math.ceil(total / SITEMAP_CHUNK_SIZE));
}

export async function getCompanySitemapEntries(chunk: number): Promise<Array<{ id: string; updatedAt?: string }>> {
  const provider = getProvider();
  const run = async () => {
    if (provider === "db") return listJuristicForSitemap(chunk);
    if (provider === "opend" && chunk === 0) return (await listOpendIds()).map((id) => ({ id }));
    return [];
  };
  return run().catch((e) => {
    console.error(`[api] sitemap chunk ${chunk} failed:`, e);
    return [];
  });
}

/** นิติบุคคลจดทะเบียนใหม่ล่าสุดสำหรับหน้าแรก */
export async function listRecentCompanies(limit = 20): Promise<JuristicProfile[]> {
  const provider = getProvider();
  if (provider !== "db" && provider !== "opend") return [];
  return (provider === "db" ? listRecentJuristic(limit) : listRecentOpend(limit)).catch((e) => {
    console.error("[api] recent companies failed:", e);
    return [];
  });
}

/** รายชื่อบริษัทตัวอย่างสำหรับหน้าแรก (เฉพาะโหมด mock) */
export function listMockProfiles(): JuristicProfile[] {
  if (!isMockMode()) return [];
  return Object.keys(MOCK_COMPANIES)
    .map((id) => fetchMockCompany(id)?.profile)
    .filter((p): p is JuristicProfile => !!p);
}
