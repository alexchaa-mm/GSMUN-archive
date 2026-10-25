import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicDatabase } from "../supabase/server";
import { normalizeBook } from "./content-mapper";
import type { ArchiveRow, AssetRow, BookRow, PhotoRow, SectionRow } from "./model";

async function rows<T>(db: SupabaseClient, table: string, column?: string, value?: string | string[]): Promise<T[]> {
  const result: T[] = [];
  for (let offset=0;;offset+=500) {
    let query = db.from(table).select("*").order("id").range(offset,offset+499);
    if (column && value !== undefined) query = Array.isArray(value) ? query.in(column,value) : query.eq(column,value);
    const {data,error} = await query;
    if (error) throw new Error(`Content request failed (${error.code}).`);
    result.push(...data as T[]);
    if (data.length < 500) return result;
  }
}
async function relatedAssets(db: SupabaseClient, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const assets: AssetRow[] = [];
  for (let offset=0;offset<unique.length;offset+=100) assets.push(...await rows<AssetRow>(db,"assets","id",unique.slice(offset,offset+100)));
  return assets;
}
export async function getDatabasePublishedBooks() {
  const db = publicDatabase();
  // Homepage contains book/artwork metadata only; photographs load on archive entry.
  const books = await rows<BookRow>(db,"books");
  if (!books.length) return [];
  const archives = await rows<ArchiveRow>(db,"archives");
  const assets = await relatedAssets(db,books.flatMap(book => [book.cover_asset_id,book.spine_asset_id,book.back_asset_id]));
  return books.flatMap(book => {
    const normalized = normalizeBook(book,archives.find(archive => archive.book_id === book.id),[],[],assets);
    return normalized ? [normalized] : [];
  }).sort((left,right) => left.sortOrder-right.sortOrder || left.id.localeCompare(right.id));
}
export async function getDatabaseBook(id: string, db = publicDatabase(), preview = false) {
  const [book] = await rows<BookRow>(db,"books","id",id);
  if (!book) return null;
  const [archive] = await rows<ArchiveRow>(db,"archives","book_id",id);
  if (!archive) return null;
  const sections = await rows<SectionRow>(db,"sections","archive_id",archive.id);
  const photos: PhotoRow[] = [];
  for (let offset=0;offset<sections.length;offset+=100) {
    photos.push(...await rows<PhotoRow>(db,"photos","section_id",sections.slice(offset,offset+100).map(section => section.id)));
  }
  const assets = await relatedAssets(db,[book.cover_asset_id,book.spine_asset_id,book.back_asset_id,...photos.map(photo => photo.asset_id)]);
  return normalizeBook(book,archive,sections,photos,assets,preview);
}
