import type { ArchiveSection } from "./catalog";

/** Sections and photographs retain stable content IDs, independently of position. */
export function orderedArchiveSections(sections: readonly ArchiveSection[]) {
  return [...sections].sort((left, right) => left.sortOrder - right.sortOrder);
}

/** Fetch the image itself: cross-origin `download` links alone do not download. */
export async function fetchPhotoDownload(src: string, signal?: AbortSignal) {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error("The photograph could not be downloaded.");
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith("image/")) {
    throw new Error("The photograph is unavailable.");
  }
  return blob;
}

export function photoFilename(id: string, type: string) {
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/avif" ? "avif" : "jpg";
  return `${id.replace(/[^a-z0-9_-]/gi, "-")}.${extension}`;
}
