import { z } from "zod";

export const PAGE_SIZE = 48;
export const listingSchema = z.object({
  entity: z.enum(["books", "archives", "sections", "photos", "assets"]).default("books"),
  parent: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(160).optional(),
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(160).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  search: z.string().trim().max(120).default(""),
  status: z.enum(["all", "draft", "published", "archived", "processing", "ready", "failed"]).default("all"),
  sort: z.enum(["order", "newest", "oldest", "name"]).default("order"),
  assetKind:z.enum(["all","artwork","photos"]).default("all"),
}).refine(value => !["archives", "sections", "photos"].includes(value.entity) || !!value.parent,
  { message: "Select a parent book or chapter first.", path: ["parent"] });
export type Listing = z.infer<typeof listingSchema>;
export type ListOptions = Partial<Pick<Listing, "offset" | "limit" | "search" | "status" | "sort" | "assetKind">>;

// PostgREST's OR expression has its own grammar. Quote values and escape pattern
// metacharacters so text is never interpreted as an extra filter/expression.
export function searchPattern(value: string) {
  return `"%${value.replace(/[\\%_]/g, "\\$&").replaceAll('"', '\\"')}%"`;
}
export function listingOrder(entity: string, sort: string) {
  if (sort === "name") return { column: entity === "assets" ? "original_filename" : entity === "photos" ? "alt" : "title", ascending: true };
  if (sort === "newest" || sort === "oldest" || entity === "assets") return { column: "created_at", ascending: sort === "oldest" };
  return { column: entity === "archives" ? "id" : "sort_order", ascending: true };
}
export function searchColumns(entity: string) {
  return entity === "photos" ? ["alt", "caption", "credit"] : entity === "assets" ? ["original_filename"] : entity === "books" ? ["title", "short_title", "committee_name", "description"] : entity === "sections" ? ["title"] : ["title", "description"];
}
