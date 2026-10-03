/**
 * Cloudflare R2 (S3-compatible) — ใช้เมื่อตั้ง R2_ENDPOINT / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
 * (ไม่ import "server-only" เพื่อให้สคริปต์สำรองข้อมูลใช้ได้)
 */
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export function isR2Configured(): boolean {
  return Boolean(process.env.R2_ENDPOINT && process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

const g = globalThis as unknown as { __tdcR2?: S3Client };
function client(): S3Client {
  g.__tdcR2 ??= new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "" },
  });
  return g.__tdcR2;
}
const bucket = () => process.env.R2_BUCKET ?? "";

export async function r2Put(key: string, body: Buffer | Uint8Array, contentType: string, cacheControl?: string): Promise<void> {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }));
}

export async function r2Get(key: string): Promise<{ body: Buffer; type: string } | null> {
  try {
    const r = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!r.Body) return null;
    return { body: Buffer.from(await r.Body.transformToByteArray()), type: r.ContentType ?? "application/octet-stream" };
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

export async function r2Delete(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function r2List(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const r = await client().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
