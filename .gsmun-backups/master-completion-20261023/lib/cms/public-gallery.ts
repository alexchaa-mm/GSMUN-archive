import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArchiveRow, BookRow, PhotoRow, SectionRow } from "./model";
import { normalizeBook } from "./content-mapper";
import { relatedAssets, rows } from "./content";
import { searchPattern } from "./listing";
import type { GalleryPage, GalleryPhoto } from "./gallery-page";

export const galleryQuery = z.object({ section:z.string().max(160).optional(), search:z.string().trim().max(120).default(""), offset:z.coerce.number().int().min(0).max(100000).default(0), sort:z.enum(["order","newest","oldest"]).default("order"), photo:z.string().max(160).optional(),anchor:z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/).optional(),direction:z.enum(["next","previous"]).default("next") });

// Uses the anonymous, RLS-constrained client in public routes. No admin cookie or
// service key is involved, even when the request comes from an administrator.
export async function publicGalleryPage(db:SupabaseClient, bookId:string, input:unknown, preview=false):Promise<GalleryPage | null> {
  const q = galleryQuery.parse(input);
  const [book] = await rows<BookRow>(db,"books","id",bookId);
  const [archive] = await rows<ArchiveRow>(db,"archives","book_id",bookId);
  if (!book || !archive || (!preview && (book.status !== "published" || archive.status !== "published"))) return null;
  let sections = (await rows<SectionRow>(db,"sections","archive_id",archive.id)).filter(section => preview || section.status === "published");
  if (q.section) sections = sections.filter(section => section.id === q.section || section.legacy_id === q.section);
  if (!sections.length) return {photos:[],count:0,offset:q.offset,hasMore:false};
  if(q.anchor){
    let currentQuery=db.from("photos").select("*").eq("id",q.anchor).in("section_id",sections.map(section=>section.id));
    if(!preview)currentQuery=currentQuery.eq("status","published");
    const current=await currentQuery.maybeSingle();
    if(current.error)throw new Error("Photograph navigation unavailable.");
    if(!current.data)return {photos:[],count:0,offset:0,hasMore:false};
    const ordered=[...sections].sort((a,b)=>a.sort_order-b.sort_order || a.id.localeCompare(b.id));
    const start=ordered.findIndex(section=>section.id===current.data.section_id);const forward=q.direction==="next";const compare=forward?"gt":"lt";
    for(let step=0;step<=ordered.length;step++){
      const section=ordered[(start+(forward?step:-step)+ordered.length*2)%ordered.length];
      let candidate=db.from("photos").select("*").eq("section_id",section.id);
      if(!preview)candidate=candidate.eq("status","published");
      if(step===0)candidate=candidate.or(`sort_order.${compare}.${Number(current.data.sort_order)},and(sort_order.eq.${Number(current.data.sort_order)},id.${compare}.${q.anchor})`);
      const result=await candidate.order("sort_order",{ascending:forward}).order("id",{ascending:forward}).limit(1);
      if(result.error)throw new Error("Photograph navigation unavailable.");
      if(!result.data?.length)continue;
      const row=result.data[0] as PhotoRow;const assets=await relatedAssets(db,[row.asset_id]);
      const normalized=normalizeBook(book,archive,[section],[row],assets,preview);
      return {photos:(normalized?.sections[0]?.photos ?? []).map(photo=>({...photo,sectionTitle:section.title})),count:1,offset:0,hasMore:false};
    }
    return {photos:[],count:0,offset:0,hasMore:false};
  }
  let query = db.from("photos").select("*", {count:"exact"}).in("section_id",sections.map(section => section.id));
  if (!preview) query = query.eq("status","published");
  if (q.photo) query = query.eq("id",q.photo);
  if (q.search) {
    const pattern = searchPattern(q.search);
    // Catalogue metadata is genuinely searchable; no fake tags/editions are added
    // to the schema. GSMUN 2026 is the current collection's existing edition.
    const bookMatch = `GSMUN 2026 ${book.title} ${book.committee_name} ${book.description} ${archive.title} ${archive.description}`.toLowerCase().includes(q.search.toLowerCase());
    const matchingSections = sections.filter(section => section.title.toLowerCase().includes(q.search.toLowerCase()));
    if (!bookMatch) query = query.or([...["alt","caption","credit"].map(field => `${field}.ilike.${pattern}`), ...(matchingSections.length ? [`section_id.in.(${matchingSections.map(section => section.id).join(",")})`] : [])].join(","));
  }
  const column = q.sort === "order" ? "sort_order" : "created_at";
  const result = await query.order(column,{ascending:q.sort !== "newest"}).order("id").range(q.offset,q.offset+47);
  if (result.error) throw new Error("Photograph listing unavailable.");
  const photos = result.data as PhotoRow[];
  const assets = await relatedAssets(db,photos.map(photo => photo.asset_id));
  const normalized = normalizeBook(book,archive,sections,photos,assets,preview);
  const mapped = new Map(normalized?.sections.flatMap(section => section.photos).map(photo => [photo.id,photo as GalleryPhoto]) ?? []);
  const count = result.count ?? photos.length;
  return {photos:photos.flatMap(photo => mapped.has(photo.id) ? [mapped.get(photo.id)!] : []),count,offset:q.offset,hasMore:q.offset+48<count};
}
