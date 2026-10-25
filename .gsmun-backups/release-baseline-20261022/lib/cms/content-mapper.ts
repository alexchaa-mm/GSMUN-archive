import type { PublicBook } from "../../app/catalog";
import type { ArchiveRow, AssetRow, BookRow, PhotoRow, SectionRow } from "./model";

export function assetUrl(asset: AssetRow | undefined, variant = "original") {
  if (!asset || asset.processing_status !== "ready") return undefined;
  if (asset.source_url) {
    try {
      for (const source of [asset.source_url, asset.thumbnail_url].filter(Boolean)) {
        const url = new URL(source!);
        if (url.protocol !== "https:" || /(^|\.)unsplash\.com$/i.test(url.hostname)) return undefined;
      }
    } catch { return undefined; }
  }
  if (asset.source_url) return variant === "thumbnail" ? asset.thumbnail_url ?? asset.source_url : asset.source_url;
  return `/api/assets/${asset.id}?variant=${variant}`;
}
export function normalizeBook(
  book: BookRow, archive: ArchiveRow | undefined, sections: SectionRow[], photos: PhotoRow[], assets: AssetRow[], preview = false,
): PublicBook | null {
  if (!archive || (!preview && (book.status !== "published" || archive.status !== "published"))) return null;
  const byAsset = new Map(assets.map(asset => [asset.id,asset]));
  return {
    id:book.id, slug:book.slug, title:book.title, shortTitle:book.short_title, committeeName:book.committee_name,
    description:book.description, status:book.status, sortOrder:book.sort_order, height:book.physical_height,
    thickness:book.physical_thickness, presentationVariant:book.presentation_variant,
    cover:book.cover_color, accent:book.accent_color, ink:book.ink_color, motif:book.motif,
    quote:book.quote, quoteBy:book.quote_by, living:book.living,
    coverImage:assetUrl(byAsset.get(book.cover_asset_id ?? "")),
    spineImage:assetUrl(byAsset.get(book.spine_asset_id ?? "")), backImage:assetUrl(byAsset.get(book.back_asset_id ?? "")),
    archiveTitle:archive.title, archiveDescription:archive.description,
    sections:sections.filter(section => section.archive_id === archive.id && (preview || section.status === "published"))
      .sort((left,right) => left.sort_order-right.sort_order || left.id.localeCompare(right.id))
      .map(section => ({
        id:section.legacy_id ?? section.id, title:section.title, sortOrder:section.sort_order,
        photos:photos.filter(photo => photo.section_id === section.id && (preview || photo.status === "published"))
          .sort((left,right) => left.sort_order-right.sort_order || left.id.localeCompare(right.id))
          .flatMap(photo => {
            const asset = byAsset.get(photo.asset_id);
            const src = assetUrl(asset,"viewer");
            if (!asset || !src) return [];
            return [{id:photo.id,src,thumbnail:assetUrl(asset,"thumbnail") ?? src,original:assetUrl(asset),
              alt:photo.alt,caption:photo.caption || undefined,credit:photo.credit,creditUrl:photo.credit_url,width:asset.width,height:asset.height}];
          }),
      })),
  };
}
