import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {driveSettings,driveId} from "./drive-client";
import {rows} from "./content";
import {navigationBooks} from "./navigation-service";
import {contentId} from "./model";
import {databaseError} from "./http";
import {CmsError} from "./errors";
import {checkUploadDestination} from "./upload-service";
export const driveListSchema=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0),status:z.enum(["all","queued","importing","imported","failed","deferred","duplicate","needs_mapping","unsupported","source_changed"]).default("all")});
export async function driveAdminState(db:SupabaseClient,input:unknown){
  const q=driveListSchema.parse(input);const settings=driveSettings();
  let query=db.from("drive_import_jobs").select("*",{count:"exact"}).order("created_at",{ascending:false}).order("id").range(q.offset,q.offset+47);
  if(settings.root)query=query.eq("root_id",settings.root);if(q.status!=="all")query=query.eq("status",q.status);
  const result=await query;
  if(["PGRST205","42P01"].includes(result.error?.code ?? ""))return {configured:settings.configured,enabled:settings.enabled,schemaReady:false,jobs:[],count:0,offset:q.offset,books:[],mappings:[],sync:null};
  databaseError(result.error);
  const [books,mappings,states]=await Promise.all([navigationBooks(db,true),rows(db,"drive_folder_mappings"),rows<{id:string;data:{queue:{id:string;path:string[];retryAt?:string}[];lastFullScan?:string}}>(db,"drive_sync_state")]);
  // No tokens, file paths, private keys or administrator session credentials.
  return {configured:settings.configured,enabled:settings.enabled,schemaReady:true,jobs:result.data ?? [],count:result.count ?? 0,offset:q.offset,books,mappings,sync:states[0] ? {pendingFolders:states[0].data.queue.length,folderErrors:states[0].data.queue.filter(folder=>folder.retryAt),lastFullScan:states[0].data.lastFullScan} : null};
}
export const mappingSchema=z.object({folderId:z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),bookId:contentId,sectionId:contentId});
export async function saveDriveMapping(db:SupabaseClient,input:unknown){
  const q=mappingSchema.parse(input);const settings=driveSettings();if(!settings.configured)throw new CmsError("Configure and enable the designated Drive source first.",503);
  driveId(q.folderId);
  const discovered=await db.from("drive_sync_state").select("data").eq("id","main").eq("root_id",settings.root).single();databaseError(discovered.error);
  const path=discovered.data?.data?.folders?.[q.folderId] as string[]|undefined;
  if(!path || path.some(name=>/^(artwork|covers?|spines?|backs?)$/i.test(name.trim())))throw new CmsError("Choose a discovered photograph folder beneath the configured root, not an artwork folder.",409);
  await checkUploadDestination(db,{id:crypto.randomUUID(),bookId:q.bookId,sectionId:q.sectionId,kind:"photo",photoId:null,allowDuplicate:false});
  const current=await db.from("drive_folder_mappings").select("id").eq("id",q.folderId).maybeSingle();databaseError(current.error);
  const value={id:q.folderId,root_id:settings.root,book_id:q.bookId,section_id:q.sectionId};
  const saved=current.data ? await db.from("drive_folder_mappings").update(value).eq("id",q.folderId) : await db.from("drive_folder_mappings").insert(value);databaseError(saved.error);
  return {ok:true};
}
