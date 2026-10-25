import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {rows} from "./content";
import type {BookRow,ArchiveRow,SectionRow} from "./model";
import {navigationSchema,defaultNavigation,destinationAvailable,publishedNavigationConfig,buildNavigation,type NavigationBook,type NavigationConfig} from "./navigation";
import {CmsError} from "./errors";
import {databaseError} from "./http";
export async function navigationBooks(db:SupabaseClient,privateView=false):Promise<NavigationBook[]>{
  const books=await rows<BookRow>(db,"books");const archives=await rows<ArchiveRow>(db,"archives");const sections=await rows<SectionRow>(db,"sections");
  return books.filter(book=>privateView || book.status==="published").sort((a,b)=>a.sort_order-b.sort_order || a.id.localeCompare(b.id)).map(book=>{const archive=archives.find(archive=>archive.book_id===book.id);return {id:book.id,slug:book.slug,title:book.title,shortTitle:book.short_title,committeeName:book.committee_name,status:book.status,archiveStatus:archive?.status ?? "draft",sections:sections.filter(section=>section.archive_id===archive?.id).sort((a,b)=>a.sort_order-b.sort_order || a.id.localeCompare(b.id)).map(section=>({id:section.id,title:section.title,status:section.status}))};});
}
export async function navigationRecord(db:SupabaseClient,key:"draft"|"published"){
  const result=await db.from("archive_navigation").select("*").eq("key",key).maybeSingle();
  if(["PGRST205","42P01"].includes(result.error?.code ?? ""))throw new CmsError("Navigation settings are not installed. Review and approve the proposed schema before using cloud persistence.",503);
  databaseError(result.error);return result.data as {key:string;data:NavigationConfig;version:number}|null;
}
export async function publicNavigation(db:SupabaseClient){
  const books=await navigationBooks(db);
  let config=defaultNavigation();try{const record=await navigationRecord(db,"published");if(record)config=navigationSchema.parse(record.data);}catch(error){if(!(error instanceof CmsError && error.message.startsWith("Navigation settings are not installed")))throw error;}
  return buildNavigation(config,books);
}
export async function adminNavigation(db:SupabaseClient){
  const [draft,published,books]=await Promise.all([navigationRecord(db,"draft"),navigationRecord(db,"published"),navigationBooks(db,true)]);
  return {config:draft?.data ?? published?.data ?? defaultNavigation(),publishedConfig:published?.data ?? defaultNavigation(),draftVersion:draft?.version ?? 0,publishedVersion:published?.version ?? 0,books};
}
export async function saveNavigation(db:SupabaseClient,input:{action:"draft"|"publish";config:unknown;version:number}){
  const config=navigationSchema.parse(input.config);
  const books=await navigationBooks(db,true);
  if(input.action==="publish" && config.groups.some(group=>group.visible && group.entries.some(entry=>entry.visible && !destinationAvailable(entry,books))))throw new CmsError("A visible destination is unavailable or unpublished. Hide or fix it before publishing navigation.",409);
  const key=input.action==="draft" ? "draft" : "published";const current=await navigationRecord(db,key);
  if((current?.version ?? 0)!==input.version)throw new CmsError("Navigation changed in another session. Reload before saving; your form remains here.",409);
  const data=key==="published" ? publishedNavigationConfig(config,books) : config;
  const record={key,data,version:input.version+1,updated_at:new Date().toISOString()};
  const result=current ? await db.from("archive_navigation").update(record).eq("key",key).eq("version",input.version).select("key").single() : await db.from("archive_navigation").insert(record).select("key").single();
  if(result.error?.code==="23505" || result.error?.code==="PGRST116")throw new CmsError("Navigation changed in another session. Reload before saving.",409);databaseError(result.error);
  return {ok:true,version:record.version,preview:buildNavigation(config,books)};
}
