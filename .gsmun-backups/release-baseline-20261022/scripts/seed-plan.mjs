import { createHash } from "node:crypto";
// Stable UUIDs make interrupted migration retries safe without changing seed identity.
export function seedId(value) {
  const hash = createHash("sha256").update(`gsmun-seed:${value}`).digest("hex");
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
export function seedBook(book) {
  return {
    id: book.id, slug: book.slug, title: book.title, short_title: book.shortTitle,
    committee_name: book.committeeName, description: book.description, sort_order: book.sortOrder,
    physical_height: book.height, physical_thickness: book.thickness, presentation_variant: book.presentationVariant,
    cover_color: book.cover, accent_color: book.accent, ink_color: book.ink, motif: book.motif,
    quote: book.quote, quote_by: book.quoteBy, living: book.living ?? false,
    legacy_metadata: { fullTitle: book.fullTitle, spine: book.spine, author: book.author, format: book.format, availability: book.availability, url: book.url, linkLabel: book.linkLabel },
  };
}
