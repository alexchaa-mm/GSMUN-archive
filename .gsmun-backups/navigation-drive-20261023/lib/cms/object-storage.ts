import "server-only";
import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CmsError } from "./errors";
import { cachedVariant } from "./media-cache";

// Per-object references retain their provider. Changing the upload default must
// never reinterpret existing Supabase objects as R2 objects (or vice versa).
// Keep the installed assets CHECK (storage_key ~ '^books/[a-zA-Z0-9_-]+/')
// intact. This reserved namespace is a provider reference, not an object key;
// actual R2 objects still use books/{book-id}/... beneath the private bucket.
const R2_PREFIX = "books/_r2/";
let connection:{account:string;bucket:string;accessKeyId:string;secretAccessKey:string;client:S3Client}|undefined;
export function downloadFilename(value: string) {
  return value.replace(/[\p{Cc}/\\<>:"|?*]/gu, "-").replace(/^\.+/, "").trim().slice(0, 200) || "GSMUN-photograph.jpg";
}
export function attachment(value: string) {
  const name = downloadFilename(value);
  return `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
function r2Config() {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, R2_BUCKET: bucket } = process.env;
  if (!account || !/^[a-f0-9]{32}$/i.test(account) || !accessKeyId || !secretAccessKey || !bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new CmsError("Private R2 storage is not configured. Ask the administrator to check the server settings.", 503);
  }
  if(connection && connection.account===account && connection.bucket===bucket && connection.accessKeyId===accessKeyId && connection.secretAccessKey===secretAccessKey)return connection;
  connection?.client.destroy();
  connection={account,bucket,accessKeyId,secretAccessKey,client:new S3Client({ region: "auto", endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey }, maxAttempts: 3, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" })};
  return connection;
}
function logicalKey(value: string) {
  if (!/^books\/[a-zA-Z0-9_/-]+\/[a-zA-Z0-9_.-]+$/.test(value) || value.includes("..")) throw new CmsError("Invalid stored image reference.", 409);
  return value;
}
export function storageKind(reference?: string | null) {
  if (reference) return reference.startsWith(R2_PREFIX) ? "r2" : "supabase";
  const kind = process.env.GSMUN_OBJECT_STORAGE ?? "supabase";
  if (!["supabase", "r2"].includes(kind)) throw new CmsError("Invalid server storage configuration.", 503);
  return kind as "supabase" | "r2";
}
export function assetStorage(db: SupabaseClient, reference?: string | null) {
  const kind = storageKind(reference);
  const r2 = kind === "r2" ? r2Config() : null;
  const key = (value: string) => {
    if (!r2) return logicalKey(value);
    const expected = `${R2_PREFIX}${r2.bucket}/`;
    if (!value.startsWith(expected)) throw new CmsError("Stored image belongs to a different storage bucket. Nothing was changed.", 409);
    return logicalKey(value.slice(expected.length));
  };
  const location = (value: string) => r2 ? `${R2_PREFIX}${r2.bucket}/${logicalKey(value)}` : logicalKey(value);
  async function read(value: string) {
    if (r2) {
      const result = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key(value) }));
      if (!result.Body || !result.ContentLength || result.ContentLength > 64 * 1024 * 1024) throw new CmsError("Stored image is missing or exceeds the validation limit.", 409);
      return Buffer.from(await result.Body.transformToByteArray());
    }
    const result = await db.storage.from("archive-assets").download(key(value));
    if (result.error || !result.data) throw new CmsError("The stored image could not be read.", 503);
    return Buffer.from(await result.data.arrayBuffer());
  }
  async function put(value: string, bytes: Buffer, mime: string) {
    let conflict = false;
    if (r2) {
      try {
        await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key(value), Body: bytes, ContentType: mime, CacheControl: "private, no-store", IfNoneMatch: "*", Metadata: { sha256: createHash("sha256").update(bytes).digest("hex") } }));
        return;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 409 && status !== 412) throw new CmsError("Private image transfer failed. Retry the same upload ID; existing files are retained.", 503);
        conflict = true;
      }
    } else {
      const result = await db.storage.from("archive-assets").upload(key(value), bytes, { contentType: mime, upsert: false, cacheControl: "0" });
      if (!result.error) return;
      conflict = String(result.error.statusCode) === "409" || /already exists|duplicate/i.test(result.error.message);
      if (!conflict) throw new CmsError("Image transfer failed. Retry this same upload; its tracked files are retained.", 503);
    }
    if (conflict && createHash("sha256").update(await read(value)).digest("hex") !== createHash("sha256").update(bytes).digest("hex")) {
      throw new CmsError("Existing storage bytes could not be verified. Nothing was overwritten; retain this upload ID for recovery.", 409);
    }
  }
  // Called only AFTER publication-aware RLS / administrator preview authorization.
  async function serve(value: string, mime: string, filename?: string, range?: string | null) {
    const headers = new Headers({ "Content-Type": mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    if (filename) headers.set("Content-Disposition", attachment(filename));
    if (!r2) return new Response(new Uint8Array(await read(value)), { headers });
    if (process.env.GSMUN_R2_DELIVERY === "signed") {
      // Optional offload; already issued bearer URLs remain usable for <=30s.
      // Proxy (default) is preferable when withdrawal must take effect immediately.
      const url = await getSignedUrl(r2.client, new GetObjectCommand({ Bucket: r2.bucket, Key: key(value), ResponseContentType: mime, ...(filename ? { ResponseContentDisposition: attachment(filename) } : {}) }), { expiresIn: 30 });
      return new Response(null, { status: 307, headers: { ...Object.fromEntries(headers), Location: url } });
    }
    if (range && !/^bytes=\d+-\d*$/.test(range)) return new Response("Invalid byte range", { status: 416, headers });
    try {
      const cached=!range ? await cachedVariant(value,()=>read(value)) : null;
      if(cached){headers.set("Content-Length",String(cached.length));return new Response(new Uint8Array(cached),{headers});}
      const result = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key(value), ...(range ? { Range: range } : {}) }));
      if (!result.Body) return new Response("Image unavailable", { status: 404, headers });
      headers.set("Accept-Ranges", "bytes");
      if (result.ContentLength !== undefined) headers.set("Content-Length", String(result.ContentLength));
      if (result.ContentRange) headers.set("Content-Range", result.ContentRange);
      return new Response(result.Body.transformToWebStream() as ReadableStream<Uint8Array>, { status: result.ContentRange ? 206 : 200, headers });
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      return new Response("Image unavailable", { status: status === 404 ? 404 : status === 416 ? 416 : 503, headers });
    }
  }
  return { kind, location, put, read, serve };
}
