import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { AssetRow, AssetVariant } from "./model";
import type { processImage } from "./images";
import { databaseError } from "./http";
import { CmsError } from "./errors";

export type UploadDestination = { id: string; bookId: string; kind: "photo" | "cover" | "spine" | "back"; sectionId: string | null; photoId: string | null; allowDuplicate: boolean; expectedAssetId?: string | null };
type Processed = Awaited<ReturnType<typeof processImage>>;

export async function checkUploadDestination(db: SupabaseClient, input: UploadDestination) {
  const book = await db.from("books").select("id,status,cover_asset_id,spine_asset_id,back_asset_id").eq("id", input.bookId).single(); databaseError(book.error);
  if (!book.data) throw new CmsError("The selected book no longer exists.", 404);
  if (input.kind !== "photo") {
    const current = book.data[`${input.kind}_asset_id`] ?? null;
    if (current !== input.id && current !== input.expectedAssetId) throw new CmsError("Artwork changed since this upload began. Refresh before replacing it; nothing was overwritten.", 409);
    if (current !== input.id && book.data.status === "published") throw new CmsError("Unpublish the book before replacing its artwork.", 409);
  }
  if (input.kind === "photo") {
    if (!input.sectionId) throw new CmsError("Select a chapter for the photograph.");
    const archive = await db.from("archives").select("id").eq("book_id", input.bookId).single(); databaseError(archive.error);
    if (!archive.data) throw new CmsError("This book has no archive.", 409);
    const section = await db.from("sections").select("id").eq("id", input.sectionId).eq("archive_id", archive.data.id).single(); databaseError(section.error);
    if (input.photoId) {
      const photo = await db.from("photos").select("id,status,asset_id").eq("id", input.photoId).eq("section_id", input.sectionId).single(); databaseError(photo.error);
      if (!photo.data) throw new CmsError("The selected photograph no longer exists.", 404);
      if (photo.data.asset_id !== input.id && photo.data.asset_id !== input.expectedAssetId) throw new CmsError("This photograph changed since the upload began. Refresh before replacing it.", 409);
      if (photo.data.asset_id !== input.id && photo.data.status === "published") throw new CmsError("Unpublish this photograph before replacing its image.", 409);
    }
  } else if (input.sectionId || input.photoId) throw new CmsError("Invalid artwork destination.");
}

/** Idempotent per upload identity, without changing the installed schema.
 * Keep incomplete asset rows and bytes tracked; never automatically delete files. */
export async function storeUpload(db: SupabaseClient, input: UploadDestination, file: { name: string }, bytes: Buffer, processed: Processed, attempt = 0): Promise<{ ok: boolean; assetId: string; photoId?: string }> {
  if (attempt > 2) throw new CmsError("Concurrent upload conflict. Wait, then retry this same upload identity.", 409);
  const { id, bookId, sectionId, kind, photoId } = input;
  const prefix = `books/${bookId}/${sectionId ? `sections/${sectionId}` : `artwork/${kind}`}/${id}`;
  const original = `${prefix}/original.${processed.extension}`;
  const previous = await db.from("assets").select("*").eq("id", id).maybeSingle(); databaseError(previous.error);
  const existing = previous.data as AssetRow | null;
  if (existing && (existing.storage_key !== original || existing.checksum !== processed.checksum || existing.byte_size !== bytes.length)) throw new CmsError("This upload identity belongs to another file or destination. No existing data was overwritten.", 409);
  if (!existing && sectionId && !photoId && !input.allowDuplicate) {
    for (let offset = 0; ; offset += 100) {
      const matching = await db.from("assets").select("id").eq("checksum", processed.checksum).eq("processing_status", "ready").order("id").range(offset, offset + 99); databaseError(matching.error);
      if (!matching.data?.length) break;
      const duplicate = await db.from("photos").select("id").eq("section_id", sectionId).in("asset_id", matching.data.map(asset => asset.id)).limit(1); databaseError(duplicate.error);
      if (duplicate.data?.length) throw new CmsError("Duplicate warning: this exact image is already in this chapter. Use 'Retry as intentional duplicate' only if you want another copy.", 409);
      if (matching.data.length < 100) break;
    }
  }
  const variants: Record<string, AssetVariant> = Object.fromEntries(processed.variants.map(variant => [variant.name, {
    storage_key: `${prefix}/${variant.name}.webp`, mime_type: variant.mime, width: variant.width, height: variant.height, byte_size: variant.bytes.length,
  }]));
  if (!existing) {
    const inserted = await db.from("assets").insert({ id, storage_key: original, original_filename: file.name.slice(0, 255), mime_type: processed.mime,
      width: processed.width, height: processed.height, byte_size: bytes.length, checksum: processed.checksum, variants, processing_status: "processing" });
    // A concurrent retry may have won this exact UUID. Re-read and compare it.
    if (inserted.error?.code === "23505") return storeUpload(db, input, file, bytes, processed, attempt + 1);
    databaseError(inserted.error);
  }
  if (existing?.processing_status !== "ready") {
    const put = async (key: string, data: Buffer, mime: string) => {
      const result = await db.storage.from("archive-assets").upload(key, data, { contentType: mime, upsert: false, cacheControl: "0" });
      if (!result.error) return;
      // A conflict alone is NOT proof that the stored file is correct.
      if (String(result.error.statusCode) !== "409" && !/already exists|duplicate/i.test(result.error.message)) throw new CmsError("Image transfer failed. Retry this same upload; its tracked files are retained.", 503);
      const stored = await db.storage.from("archive-assets").download(key);
      if (stored.error || !stored.data || createHash("sha256").update(Buffer.from(await stored.data.arrayBuffer())).digest("hex") !== createHash("sha256").update(data).digest("hex")) throw new CmsError("Existing storage bytes could not be verified. Nothing was overwritten; retain this upload ID for recovery.", 409);
    };
    try {
      await put(original, bytes, processed.mime);
      for (const variant of processed.variants) await put(variants[variant.name].storage_key, variant.bytes, variant.mime);
    } catch (error) {
      await db.from("assets").update({ processing_status: "failed" }).eq("id", id).neq("processing_status", "ready");
      throw error;
    }
    const ready = await db.from("assets").update({ variants, processing_status: "ready" }).eq("id", id).select("id").single(); databaseError(ready.error);
  }
  if (sectionId && !photoId) {
    const photo = await db.from("photos").select("id,section_id,asset_id").eq("id", id).maybeSingle(); databaseError(photo.error);
    if (photo.data && (photo.data.section_id !== sectionId || photo.data.asset_id !== id)) throw new CmsError("The photograph identity conflicts with existing content. Nothing was overwritten.", 409);
    if (!photo.data) {
      const last = await db.from("photos").select("sort_order").eq("section_id", sectionId).order("sort_order", { ascending: false }).limit(1); databaseError(last.error);
      const inserted = await db.from("photos").insert({ id, section_id: sectionId, asset_id: id, status: "draft", sort_order: (last.data?.[0]?.sort_order ?? 0) + 10,
        alt: file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").slice(0, 2000) });
      if (inserted.error?.code === "23505") return storeUpload(db, input, file, bytes, processed, attempt + 1);
      databaseError(inserted.error);
    }
  } else if (photoId) {
    const current = await db.from("photos").select("asset_id").eq("id", photoId).eq("section_id", sectionId).single(); databaseError(current.error);
    if (current.data?.asset_id === id) return { ok: true, assetId: id, photoId };
    const result = await db.from("photos").update({ asset_id: id }).eq("id", photoId).eq("section_id", sectionId).eq("asset_id", input.expectedAssetId).neq("status", "published").select("id").single(); databaseError(result.error);
  } else {
    if (kind === "photo") throw new CmsError("A photograph must belong to a chapter.");
    const field = `${kind}_asset_id` as const;
    const current = await db.from("books").select("cover_asset_id,spine_asset_id,back_asset_id").eq("id", bookId).single(); databaseError(current.error);
    if (current.data?.[field] === id) return { ok: true, assetId: id };
    let update = db.from("books").update({ [field]: id }).eq("id", bookId).neq("status", "published");
    update = input.expectedAssetId ? update.eq(field, input.expectedAssetId) : update.is(field, null);
    const result = await update.select("id").single(); databaseError(result.error);
  }
  return { ok: true, assetId: id, photoId: sectionId ? photoId ?? id : undefined };
}
