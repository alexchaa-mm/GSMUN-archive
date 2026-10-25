import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rows, relatedAssets } from "./content";
import { normalizeBook } from "./content-mapper";
import { searchPattern } from "./listing";
import type { ArchiveRow, BookRow, PhotoRow, SectionRow } from "./model";
import type { GalleryPhoto } from "./gallery-page";

export type SearchPhoto=GalleryPhoto & {bookTitle:string;sectionTitle:string};
export const publicSearchQuery=z.object({search:z.string().trim().max(120).default(""),book:z.string().max(160).default(""),offset:z.coerce.number().int().min(0).max(100000).default(0),sort:z.enum(["newest","oldest","order"]).default("newest")});
export async function searchArchive(db:SupabaseClient,input:unknown){
  const q=publicSearchQuery.parse(input);
  const books=(await rows<BookRow>(db,"books")).filter(book=>book.status==="published" && (!q.book || book.id===q.book));
  const archives=(await rows<ArchiveRow>(db,"archives")).filter(archive=>archive.status==="published" && books.some(book=>book.id===archive.book_id));
  const sections=(await rows<SectionRow>(db,"sections")).filter(section=>section.status==="published" && archives.some(archive=>archive.id===section.archive_id));
  if(!sections.length)return {photos:[],count:0,offset:q.offset,hasMore:false};
  const needle=q.search.toLowerCase();
  const matching=sections.filter(section=>{const archive=archives.find(archive=>archive.id===section.archive_id)!;const book=books.find(book=>book.id===archive.book_id)!;return `GSMUN 2026 ${book.title} ${book.committee_name} ${book.description} ${archive.title} ${archive.description} ${section.title}`.toLowerCase().includes(needle);});
  let query=db.from("photos").select("*",{count:"exact"}).eq("status","published").in("section_id",sections.map(section=>section.id));
  if(q.search && matching.length!==sections.length)query=query.or([...['alt','caption','credit'].map(field=>`${field}.ilike.${searchPattern(q.search)}`),...(matching.length ? [`section_id.in.(${matching.map(section=>section.id).join(",")})`] : [])].join(","));
  const result=await query.order(q.sort==="order" ? "sort_order" : "created_at",{ascending:q.sort!=="newest"}).order("id").range(q.offset,q.offset+47);
  if(result.error)throw new Error("Archive search unavailable.");
  const photoRows=result.data as PhotoRow[];
  const assets=await relatedAssets(db,photoRows.map(photo=>photo.asset_id));
  const mapped=new Map<string,SearchPhoto>();
  for(const book of books){const archive=archives.find(archive=>archive.book_id===book.id);const normalized=normalizeBook(book,archive,sections,photoRows,assets);for(const section of normalized?.sections ?? [])for(const photo of section.photos)mapped.set(photo.id,{...photo,bookTitle:book.title,sectionTitle:section.title});}
  const count=result.count ?? photoRows.length;
  return {photos:photoRows.flatMap(photo=>mapped.has(photo.id) ? [mapped.get(photo.id)!] : []),count,offset:q.offset,hasMore:q.offset+48<count};
}
