import { z } from "zod";
import type { BookMotif, BookStatus, BookPresentationVariant } from "../../app/catalog";

export const statusSchema = z.enum(["draft", "published", "archived"]);
export const contentId = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/);
const slug = z.string().min(1).max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.");
export const bookSchema = z.object({
  title: z.string().trim().min(1).max(160), short_title: z.string().trim().min(1).max(80),
  slug, committee_name: z.string().trim().max(300), description: z.string().max(6000),
  sort_order: z.number().int().min(0).max(1_000_000),
  physical_height: z.number().min(1.5).max(2.5), physical_thickness: z.number().min(0.12).max(0.4),
  presentation_variant: z.number().int().min(-2).max(2),
  cover_asset_id: z.string().uuid().nullable().optional(),
  spine_asset_id: z.string().uuid().nullable().optional(), back_asset_id: z.string().uuid().nullable().optional(),
});
export const sectionSchema = z.object({
  archive_id: z.string().uuid(), title: z.string().trim().min(1).max(160), slug,
  sort_order: z.number().int().min(0).max(1_000_000), status: statusSchema,
});
export const photoSchema = z.object({
  alt: z.string().trim().max(2000), caption: z.string().max(4000), credit: z.string().max(500),
  credit_url: z.union([z.literal(""), z.string().url().refine(value => /^https?:\/\//.test(value), "Use an HTTP or HTTPS credit link.")]),
  status: statusSchema, captured_at: z.string().datetime().nullable().optional(),
});
export const archiveSchema = z.object({ title: z.string().trim().min(1).max(160), description: z.string().max(6000) });
export const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-book"), values: bookSchema }),
  z.object({ action: z.literal("edit-book"), id: contentId, values: bookSchema }),
  z.object({ action: z.literal("book-status"), id: contentId, status: statusSchema, includeDrafts: z.literal(false).default(false) }),
  z.object({ action: z.literal("item-status"), entity: z.enum(["sections", "photos"]), id: contentId, status: statusSchema }),
  z.object({ action: z.literal("artwork"), id: contentId, kind: z.enum(["cover", "spine", "back"]), assetId: z.string().uuid().nullable() }),
  z.object({ action: z.literal("edit-archive"), id: z.string().uuid(), values: archiveSchema }),
  z.object({ action: z.literal("create-section"), values: sectionSchema }),
  z.object({ action: z.literal("edit-section"), id: contentId, values: sectionSchema.omit({archive_id:true}) }),
  z.object({ action: z.literal("edit-photo"), id: contentId, values: photoSchema }),
  z.object({ action: z.literal("move"), entity: z.enum(["books","sections","photos"]), id: contentId, beforeId: contentId.nullable() }),
  z.object({ action: z.literal("delete"), entity: z.enum(["books","sections","photos","assets"]), id: contentId, confirmation: z.literal("DELETE") }),
]);
export type CmsMutation = z.infer<typeof mutationSchema>;
export type AssetVariant = { storage_key: string; mime_type: string; width: number; height: number; byte_size: number };
export type AssetRow = {
  id: string; storage_key: string | null; source_url: string | null; thumbnail_url: string | null;
  original_filename: string; mime_type: string; width: number; height: number; byte_size: number;
  checksum: string | null; variants: Record<string,AssetVariant>; processing_status: string; created_at: string; updated_at: string;
};
export type BookRow = z.infer<typeof bookSchema> & {
  id: string; status: BookStatus; published_at: string | null; created_at: string; updated_at: string;
  cover_color: string; accent_color: string; ink_color: string; motif: BookMotif;
  quote: string; quote_by: string; living: boolean; presentation_variant: BookPresentationVariant;
};
export type ArchiveRow = { id: string; book_id: string; title: string; description: string; status: BookStatus };
export type SectionRow = z.infer<typeof sectionSchema> & { id: string; legacy_id: string | null; created_at: string; updated_at: string };
export type PhotoRow = z.infer<typeof photoSchema> & { id: string; section_id: string; asset_id: string; sort_order: number; created_at: string; updated_at: string };

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export function validateUpload(type: string, size: number) {
  if (!IMAGE_MIME_TYPES.some(mime => mime === type)) throw new Error("Upload JPEG, PNG or WebP. HEIC is not supported; export it as JPEG first.");
  if (size <= 0 || size > MAX_UPLOAD_BYTES) throw new Error("Each image must be between 1 byte and 30 MB.");
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new RequestOriginError("Request origin is not allowed.");
}
export class RequestOriginError extends Error { readonly status = 403; }
