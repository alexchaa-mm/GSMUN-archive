import type { ArchivePhoto, ArchiveSection } from "../../app/catalog";

export type GalleryPhoto = ArchivePhoto & { filename?: string; permalink?: string; sectionTitle?:string };
export const INITIAL_PHOTOS = 12;
export type GallerySection = ArchiveSection & { contentId?: string; totalPhotos?: number; hasMore?: boolean; nextOffset?: number };
export type GalleryPage = { photos: GalleryPhoto[]; count: number; offset: number; hasMore: boolean };

export function photographLink(book: string, section?: string, photo?: string) {
  const params = new URLSearchParams({ book });
  if (section) params.set("chapter", section);
  if (photo) params.set("photo", photo);
  return `/?${params}`;
}
