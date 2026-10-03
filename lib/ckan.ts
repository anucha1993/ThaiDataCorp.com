/**
 * CKAN client ของ data.go.th (Open-D) — ใช้ร่วมกันระหว่างเว็บและสคริปต์ sync
 * (ไม่ import "server-only" เพื่อให้รันด้วย tsx ได้ แต่ห้าม import จาก Client Component)
 *
 * หมายเหตุ: opend.data.go.th/get-ckan/* ตอบ 301 redirect ไปที่ data.go.th/api/3/action/*
 * และระหว่าง redirect จะแปลงพารามิเตอร์ภาษาไทยเป็น TIS-620 จนเพี้ยน
 * จึงเรียก data.go.th/api/3/action ตรง (ปลายทางเดียวกัน) เป็นค่าเริ่มต้น
 */
import { toMonthlyResources, type MonthlyResource } from "@/lib/opend-normalize";
import type { CkanDatastoreResult, CkanPackage, CkanResponse } from "@/types/company";

const REQUEST_TIMEOUT_MS = 30_000;

/** อ่าน env ตอนเรียกใช้ (ไม่ใช่ตอน import) เพื่อให้สคริปต์โหลด .env.local ก่อนได้ */
export function opendConfig() {
  return {
    baseUrl: (process.env.OPEND_BASE_URL ?? "https://data.go.th/api/3/action").replace(/\/+$/, ""),
    apiKey: process.env.OPEND_API_KEY?.trim() ?? "",
    newDataset: process.env.OPEND_NEW_DATASET ?? "dataset_11_0121",
    dissolvedDataset: process.env.OPEND_DISSOLVED_DATASET ?? "dataset_11_0219",
  };
}

export class OpendApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpendApiError";
  }
}

export interface CkanCallOptions {
  /** วินาทีที่ให้ Next.js Data Cache เก็บผลไว้ (ใช้ฝั่งเว็บเท่านั้น) */
  revalidate?: number;
  /** จำนวนครั้งที่ลองใหม่เมื่อเจอ network error / 5xx / 429 */
  retries?: number;
}

export async function ckan<T>(
  action: string,
  params: Record<string, string | number | object>,
  { revalidate, retries = 0 }: CkanCallOptions = {},
): Promise<T> {
  const { baseUrl, apiKey } = opendConfig();
  const url = new URL(`${baseUrl}/${action}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "api-key": apiKey },
        ...(revalidate !== undefined && { next: { revalidate } }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new OpendApiError(`Open-D ${action} failed: ${res.status} ${res.statusText}`, res.status);

      const body = (await res.json()) as CkanResponse<T>;
      if (!body.success || body.result === undefined) {
        throw new OpendApiError(`Open-D ${action} error: ${JSON.stringify(body.error ?? "unknown")}`, 400);
      }
      return body.result;
    } catch (err) {
      const status = err instanceof OpendApiError ? err.status : undefined;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

export async function getMonthlyResources(datasetId: string, opts?: CkanCallOptions): Promise<MonthlyResource[]> {
  const pkg = await ckan<CkanPackage>("package_show", { id: datasetId }, opts);
  return toMonthlyResources(pkg.resources);
}

export function datastoreSearch<R>(
  resourceId: string,
  params: Record<string, string | number | object>,
  opts?: CkanCallOptions,
): Promise<CkanDatastoreResult<R>> {
  return ckan<CkanDatastoreResult<R>>("datastore_search", { resource_id: resourceId, ...params }, opts);
}
