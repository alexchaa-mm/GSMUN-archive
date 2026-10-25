import "server-only";
import {createHash,randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {DriveClient,DriveFile} from "./drive-client";
import {driveId} from "./drive-client";
import {navigationBooks} from "./navigation-service";
import type {NavigationBook} from "./navigation";
import {validateUpload} from "./model";
import {processImage} from "./images";
import {checkUploadDestination,storeUpload} from "./upload-service";
import {reserveUploadSlot} from "./upload-slots";
import {CmsError} from "./errors";
import {databaseError} from "./http";
import {rows} from "./content";
import type {AssetRow} from "./model";
import {assetStorage} from "./object-storage";

export type DriveJob={id:string;drive_file_id:string;root_id:string;parent_id:string;folder_path:string[];filename:string;mime_type:string;byte_size:number;md5_checksum:string;source_version:string;status:string;book_id:string|null;section_id:string|null;upload_id:string;asset_id:string|null;photo_id:string|null;attempts:number;error:string;retry_at:string|null;lease_token:string|null;lease_expires_at:string|null;created_at?:string};
type Mapping={id:string;root_id:string;book_id:string;section_id:string};
type Folder={id:string;path:string[];page?:string;failures?:number;retryAt?:string};
type Cursor={queue:Folder[];folders:Record<string,string[]>;failedFolders?:Folder[];changeToken?:string;lastFullScan?:string;lastScanStarted?:string;reconcile?:boolean;budgetDay?:string;downloadBytes?:number};
type SyncState={id:string;root_id:string;data:Cursor;lease_token:string|null;lease_expires_at:string|null};
const folderMime="application/vnd.google-apps.folder";
export function driveUploadId(root:string,file:string){const bytes=createHash("sha256").update(`gsmun-drive:${root}:${file}`).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
const normalized=(name:string)=>name.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("en");
const sourceBytes=(file:DriveFile)=>Number.isSafeInteger(Number(file.size)) && Number(file.size)>=0 ? Number(file.size) : 0;
function sourceState(file:DriveFile,hasDestination:boolean){
  if(!["image/jpeg","image/png","image/webp"].includes(file.mimeType)){try{validateUpload(file.mimeType,1);}catch(error){return {status:"unsupported",error:error instanceof Error?error.message:"Unsupported photograph."};}}
  if(!file.size || !Number.isSafeInteger(Number(file.size)) || Number(file.size)<=0 || !file.md5Checksum || !file.version)return {status:"deferred",error:"Drive has not supplied a complete binary size/checksum/version. The file will be checked again automatically."};
  try{validateUpload(file.mimeType,Number(file.size));}catch(error){return {status:"unsupported",error:error instanceof Error?error.message:"Unsupported photograph."};}
  return hasDestination ? {status:"queued",error:""} : {status:"needs_mapping",error:"Unknown or ambiguous book/chapter folder. Assign this folder explicitly; no destination was guessed."};
}
export function folderDestination(path:string[],books:NavigationBook[],mapping?:Mapping){
  if(path.some(name=>/^(artwork|covers?|spines?|backs?)$/i.test(name.trim())))return null;
  if(mapping){const book=books.find(book=>book.id===mapping.book_id);const section=book?.sections.find(section=>section.id===mapping.section_id);return book && section ? {bookId:book.id,sectionId:section.id} : null;}
  if(path.length!==2)return null;
  const matches=books.filter(book=>[book.id,book.slug,book.title,book.shortTitle].some(name=>normalized(name)===normalized(path[0])));
  if(matches.length!==1)return null;
  const sections=matches[0].sections.filter(section=>[section.id,section.title].some(name=>normalized(name)===normalized(path[1])) || normalized(section.title).replace(/ /g,"-")===normalized(path[1]));
  return sections.length===1 ? {bookId:matches[0].id,sectionId:sections[0].id} : null;
}
function schemaError(error:{code?:string}|null){if(["PGRST205","42P01"].includes(error?.code ?? ""))throw new CmsError("Drive import tables are not installed. Review the proposed schema before enabling cloud sync.",503);databaseError(error);}
async function state(db:SupabaseClient,root:string):Promise<SyncState>{
  const result=await db.from("drive_sync_state").select("*").eq("id","main").maybeSingle();schemaError(result.error);
  if(result.data){if(result.data.root_id!==root)throw new CmsError("The configured root differs from the saved Drive source. Review the source change before syncing; nothing was moved or deleted.",409);return result.data;}
  const initial={id:"main",root_id:root,data:{queue:[{id:root,path:[]}],folders:{[root]:[]}},lease_token:null,lease_expires_at:null};
  const inserted=await db.from("drive_sync_state").insert(initial).select("*").single();schemaError(inserted.error);return inserted.data;
}
async function discover(db:SupabaseClient,root:string,files:DriveFile[],folder:Folder,books:NavigationBook[],mappings:Mapping[]){
  if(!files.length)return;
  const existing=await db.from("drive_import_jobs").select("*").in("drive_file_id",files.map(file=>file.id));schemaError(existing.error);
  const known=new Map<string,DriveJob>(existing.data?.map(row=>[row.drive_file_id,row]) ?? []);const fresh:DriveJob[]=[];
  for(const file of files){
    if(file.trashed || file.mimeType===folderMime)continue;driveId(file.id);
    const old=known.get(file.id);
    if(old){
      // Pending incomplete originals can become usable later. Do not require a
      // human retry forever, or reinterpret bytes already saved under this ID.
      if(["deferred","unsupported","failed","needs_mapping"].includes(old.status) && (old.status==="deferred" || old.md5_checksum!==file.md5Checksum || old.mime_type!==file.mimeType)){
        const asset=await db.from("assets").select("id").eq("id",old.upload_id).maybeSingle();schemaError(asset.error);
        if(!asset.data){
          const target=folderDestination(folder.path,books,mappings.find(mapping=>mapping.id===folder.id));const source=sourceState(file,!!target);
          const moved=old.parent_id!==folder.id || (old.book_id && target && (old.book_id!==target.bookId || old.section_id!==target.sectionId));
          const update=await db.from("drive_import_jobs").update({...source,...(moved?{status:"needs_mapping",error:"The pending source folder/destination changed. Review its current assignment and retry explicitly."}:{}),parent_id:folder.id,folder_path:folder.path,mime_type:file.mimeType,filename:file.name.slice(0,255),byte_size:sourceBytes(file),md5_checksum:file.md5Checksum ?? "",source_version:file.version ?? "",...(!moved?{book_id:target?.bookId ?? null,section_id:target?.sectionId ?? null}:{}),retry_at:source.status==="deferred"?new Date(Date.now()+30000).toISOString():null}).eq("id",old.id).eq("status",old.status);schemaError(update.error);continue;
        }
      }
      if(old.md5_checksum && file.md5Checksum && old.md5_checksum!==file.md5Checksum && old.status!=="source_changed"){
        const changed=await db.from("drive_import_jobs").update({status:"source_changed",error:"Drive source bytes changed. The original archive copy is retained; replace it deliberately through the photo manager."}).eq("id",old.id).neq("status","importing");schemaError(changed.error);
      }
      continue;
    }
    const destination=folderDestination(folder.path,books,mappings.find(mapping=>mapping.id===folder.id));
    const {status,error}=sourceState(file,!!destination);
    const id=driveUploadId(root,file.id);
    fresh.push({id,drive_file_id:file.id,root_id:root,parent_id:folder.id,folder_path:folder.path,filename:file.name.slice(0,255),mime_type:file.mimeType,byte_size:sourceBytes(file),md5_checksum:file.md5Checksum ?? "",source_version:file.version ?? "",status,book_id:destination?.bookId ?? null,section_id:destination?.sectionId ?? null,upload_id:id,asset_id:null,photo_id:null,attempts:0,error,retry_at:status==="deferred"?new Date(Date.now()+30000).toISOString():null,lease_token:null,lease_expires_at:null});
  }
  if(fresh.length){const inserted=await db.from("drive_import_jobs").upsert(fresh,{onConflict:"drive_file_id",ignoreDuplicates:true});schemaError(inserted.error);}
}
async function sourcePath(client:DriveClient,file:DriveFile,root:string){let current=file;const path:string[]=[];for(let depth=0;depth<8;depth++){if(current.parents?.length!==1)return null;if(current.parents[0]===root)return path.reverse();current=await client.get(current.parents[0]);if(current.trashed || current.mimeType!==folderMime)return null;path.push(current.name);}return null;}
async function recoverStoredUpload(db:SupabaseClient,job:DriveJob,destination:Parameters<typeof storeUpload>[1]){
  const result=await db.from("assets").select("*").eq("id",job.upload_id).maybeSingle();schemaError(result.error);const asset=result.data as AssetRow|null;if(!asset)return null;
  const linked=await db.from("photos").select("id,asset_id,section_id").eq("id",job.upload_id).maybeSingle();schemaError(linked.error);
  if(linked.data){if(linked.data.asset_id!==asset.id || linked.data.section_id!==job.section_id || asset.processing_status!=="ready")throw new CmsError("Tracked upload relationships need review. No photo was moved or changed.",409);return {assetId:asset.id,photoId:linked.data.id};}
  if(!asset.storage_key)throw new CmsError("The tracked original is not a private stored upload.",409);
  let bytes;try{bytes=await assetStorage(db,asset.storage_key).read(asset.storage_key);}catch(error){if(asset.processing_status==="ready")throw error;return null;}
  if(bytes.length!==asset.byte_size || createHash("sha256").update(bytes).digest("hex")!==asset.checksum)throw new CmsError("The saved original failed integrity verification. Retain this upload ID for recovery; nothing was overwritten.",409);
  // Recover a stored original even when Drive is now unavailable. The existing
  // upload service verifies destination/identity/conditional writes again.
  return storeUpload(db,destination,{name:asset.original_filename},bytes,await processImage(bytes,asset.mime_type));
}
export async function retryDriveJob(db:SupabaseClient,id:string,root:string){
  const found=await db.from("drive_import_jobs").select("*").eq("id",id).eq("root_id",root).single();schemaError(found.error);const job=found.data as DriveJob;
  if(!job || !["failed","deferred","needs_mapping"].includes(job.status))throw new CmsError("This job cannot be retried automatically. Imported, duplicate, unsupported and changed sources are retained for review.",409);
  const mapping=await db.from("drive_folder_mappings").select("*").eq("id",job.parent_id).eq("root_id",root).maybeSingle();schemaError(mapping.error);
  const books=await navigationBooks(db,true);const target=folderDestination(job.folder_path,books,mapping.data ?? undefined);
  if(!target)throw new CmsError("Choose an unambiguous folder mapping before retrying this file.",409);
  // Never silently reassign a partially persisted image to another destination.
  const asset=await db.from("assets").select("id").eq("id",job.upload_id).maybeSingle();schemaError(asset.error);
  if(asset.data && (job.book_id!==target.bookId || job.section_id!==target.sectionId))throw new CmsError("A partial upload already belongs to its original destination. Retain this upload ID and resolve it there before remapping.",409);
  const result=await db.from("drive_import_jobs").update({status:"queued",book_id:target.bookId,section_id:target.sectionId,error:"",retry_at:null}).eq("id",id).eq("status",job.status);schemaError(result.error);
}
/** Bounded tick, durable cursors and DB compare-and-set leases. Never publishes,
 * deletes source files, or deletes/reassigns already imported photographs. */
export async function syncDrive(db:SupabaseClient,client:DriveClient,root:string,options:{maxFiles?:number;maxPages?:number;onlyFileIds?:string[]}={}){
  if(options.onlyFileIds && (!options.onlyFileIds.length || options.onlyFileIds.length>5))throw new CmsError("Verification sync must select one to five explicit Drive file IDs.");
  options.onlyFileIds?.forEach(driveId);
  driveId(root);const saved=await state(db,root);const now=Date.now();
  if(saved.lease_token && Date.parse(saved.lease_expires_at ?? "")>now)return {busy:true,processed:0};
  const lease=randomUUID();let claim=db.from("drive_sync_state").update({lease_token:lease,lease_expires_at:new Date(now+300000).toISOString()}).eq("id","main");claim=saved.lease_token ? claim.eq("lease_token",saved.lease_token) : claim.is("lease_token",null);
  const acquired=await claim.select("id");schemaError(acquired.error);if(!acquired.data?.length)return {busy:true,processed:0};
  const cursor=structuredClone(saved.data);let leaseError:unknown;let heartbeat:Promise<void>|null=null;
  const renew=async()=>{const result=await db.from("drive_sync_state").update({lease_expires_at:new Date(Date.now()+300000).toISOString()}).eq("id","main").eq("lease_token",lease).select("id");schemaError(result.error);if(!result.data?.length)throw new CmsError("Import ownership changed. Retry the tracked jobs; existing records and bytes are retained.",409);};
  const held=()=>{if(leaseError)throw leaseError;};
  const timer=setInterval(()=>{if(!heartbeat)heartbeat=renew().catch(error=>{leaseError=error;}).finally(()=>{heartbeat=null;});},30000);timer.unref();
  const checkpoint=async()=>{held();const result=await db.from("drive_sync_state").update({data:cursor,lease_expires_at:new Date(Date.now()+300000).toISOString()}).eq("id","main").eq("lease_token",lease).select("id");schemaError(result.error);if(!result.data?.length)throw new CmsError("Import ownership changed. The saved cursor and existing content were retained.",409);};
  const end=Date.now()+45000;let processed=0;let handled=0;
  try{
    const rootFile=await client.get(root);if(rootFile.mimeType!==folderMime || rootFile.trashed)throw new CmsError("The designated Drive root is not an accessible folder.",409);
    const books=await navigationBooks(db,true);const mappings=await rows<Mapping>(db,"drive_folder_mappings","root_id",root);
    // Move delayed folders out of the active scan. A permanently inaccessible
    // child must never block the change feed or new photographs elsewhere.
    cursor.failedFolders ??=[];
    for(const folder of cursor.queue.filter(folder=>folder.retryAt))if(!cursor.failedFolders.some(item=>item.id===folder.id))cursor.failedFolders.push(folder);
    cursor.queue=cursor.queue.filter(folder=>!folder.retryAt);
    cursor.lastScanStarted ??=new Date().toISOString();
    if(!cursor.changeToken)cursor.changeToken=await client.startToken();
    {
      try{
        const changes=await client.changes(cursor.changeToken!);
        for(const change of changes.changes){const file=change.file;if(!file || change.removed || file.trashed)continue;
          if(file.mimeType===folderMime){cursor.reconcile=true;continue;}
          const parent=file.parents?.length===1 ? file.parents[0] : "";const path=cursor.folders[parent];
          if(path)await discover(db,root,[file],{id:parent,path},books,mappings);else cursor.reconcile=true;
        }
        cursor.changeToken=changes.nextPageToken ?? changes.newStartPageToken ?? cursor.changeToken;
      }catch(error){if(error instanceof CmsError && error.status===410){cursor.reconcile=true;cursor.changeToken=await client.startToken();}else throw error;}
    }
    if(!cursor.queue.length && (cursor.reconcile || now-Date.parse(cursor.lastScanStarted)>21600000)){cursor.queue=[{id:root,path:[]}];cursor.folders={[root]:[]};cursor.lastScanStarted=new Date().toISOString();cursor.reconcile=false;}
    for(const folder of cursor.failedFolders)if(Date.parse(folder.retryAt ?? "")<=now && !cursor.queue.some(item=>item.id===folder.id)){cursor.queue.push({...folder,retryAt:undefined});cursor.folders[folder.id]=folder.path;}
    for(let page=0;cursor.queue.length && page<(options.maxPages ?? 6) && Date.now()<end;page++){
      const folder=cursor.queue[0];
      let result;
      try{result=await client.list(folder.id,folder.page);}catch(error){if(folder.id===root)throw error;folder.failures=(folder.failures ?? 0)+1;folder.retryAt=new Date(Date.now()+Math.min(3600000,30000*2**Math.min(folder.failures,7))).toISOString();cursor.failedFolders=cursor.failedFolders.filter(item=>item.id!==folder.id);cursor.failedFolders.push(folder);cursor.queue.shift();await checkpoint();continue;}
      for(const file of result.files.filter(file=>file.mimeType===folderMime && !file.trashed))if(folder.path.length<6 && !cursor.folders[file.id]){if(Object.keys(cursor.folders).length>=1000)throw new CmsError("Too many import folders. Keep the selected import tree focused on final conference photographs.",409);const path=[...folder.path,file.name];cursor.folders[file.id]=path;const failed=cursor.failedFolders.find(item=>item.id===file.id);if(failed && Date.parse(failed.retryAt ?? "")>Date.now()){failed.path=path;continue;}cursor.queue.push({id:file.id,path,failures:failed?.failures});}
      await discover(db,root,result.files,folder,books,mappings);
      if(result.nextPageToken)folder.page=result.nextPageToken;else{cursor.queue.shift();cursor.failedFolders=cursor.failedFolders.filter(item=>item.id!==folder.id);}
      if(!cursor.queue.length && !cursor.failedFolders.length)cursor.lastFullScan=new Date().toISOString();await checkpoint();
    }
    await checkpoint();
    // Bound each eligible queue independently: delayed failures must not starve
    // new arrivals behind the first page of a large collection.
    const queue=(status:string)=>{let query=db.from("drive_import_jobs").select("*").eq("root_id",root).eq("status",status);if(options.onlyFileIds)query=query.in("drive_file_id",options.onlyFileIds);return query;};
    const [queued,failed,expired,deferred]=await Promise.all([
      queue("queued").order("created_at").limit(20),
      queue("failed").lte("retry_at",new Date().toISOString()).order("retry_at").limit(20),
      queue("importing").lte("lease_expires_at",new Date().toISOString()).order("lease_expires_at").limit(20),
      queue("deferred").lte("retry_at",new Date().toISOString()).order("retry_at").limit(20),
    ]);for(const result of [queued,failed,expired,deferred])schemaError(result.error);
    // Recover partial work first; interleave retries with new jobs.
    const candidates:DriveJob[]=[...(expired.data ?? [])];for(let i=0;i<20;i++){if(queued.data?.[i])candidates.push(queued.data[i]);if(failed.data?.[i])candidates.push(failed.data[i]);if(deferred.data?.[i])candidates.push(deferred.data[i]);}
    for(const job of candidates){
      held();if(handled>=(options.maxFiles ?? 5) || Date.now()>end)break;
      if(job.retry_at && Date.parse(job.retry_at)>Date.now())continue;
      if(job.status==="importing" && Date.parse(job.lease_expires_at ?? "")>Date.now())continue;
      const release=reserveUploadSlot();if(!release)break;
      const token=randomUUID();let locked=db.from("drive_import_jobs").update({status:"importing",lease_token:token,lease_expires_at:new Date(Date.now()+300000).toISOString(),attempts:job.attempts+1,error:""}).eq("id",job.id).eq("status",job.status);if(job.status==="importing")locked=locked.eq("lease_token",job.lease_token!);
      const lock=await locked.select("id");if(lock.error){release();schemaError(lock.error);}if(!lock.data?.length){release();continue;}handled++;
      const finish=async(values:Record<string,unknown>)=>{held();const result=await db.from("drive_import_jobs").update({...values,lease_token:null,lease_expires_at:null}).eq("id",job.id).eq("lease_token",token).select("id");schemaError(result.error);if(!result.data?.length)throw new CmsError("The import job changed elsewhere. Existing records were retained; refresh its status.",409);};
      try{
        if(!job.book_id || !job.section_id){await finish({status:"needs_mapping",error:"Choose a valid book/chapter folder assignment before importing this original.",retry_at:null});continue;}
        const destination={id:job.upload_id,bookId:job.book_id,sectionId:job.section_id,kind:"photo" as const,photoId:null,allowDuplicate:false};
        await checkUploadDestination(db,destination);
        const recovered=await recoverStoredUpload(db,job,destination);if(recovered){await finish({status:"imported",asset_id:recovered.assetId,photo_id:recovered.photoId,error:"",retry_at:null});processed++;continue;}
        const remote=await client.get(job.drive_file_id);
        const path=remote.trashed?null:await sourcePath(client,remote,root);
        if(!path)throw new CmsError("Source is no longer inside the designated folder. Existing archive records and files were retained.",409);
        const parent=remote.parents![0];const currentDestination=folderDestination(path,books,mappings.find(mapping=>mapping.id===parent));
        if(parent!==job.parent_id || !currentDestination || currentDestination.bookId!==job.book_id || currentDestination.sectionId!==job.section_id){cursor.folders[parent]=path;await checkpoint();await finish({status:"needs_mapping",parent_id:parent,folder_path:path,error:"The pending source folder or assignment changed. Review the current folder and retry explicitly; no photograph was reassigned.",retry_at:null});continue;}
        const readiness=sourceState(remote,true);if(readiness.status!=="queued"){await finish({...readiness,retry_at:readiness.status==="deferred"?new Date(Date.now()+Math.min(3600000,30000*2**Math.min(job.attempts,7))).toISOString():null});continue;}
        if(remote.capabilities?.canDownload===false)throw new CmsError("Drive has not made a downloadable original available. Check folder download permissions.",409);
        if(job.md5_checksum && remote.md5Checksum!==job.md5_checksum){await finish({status:"source_changed",error:"Drive source bytes changed. No existing asset was overwritten."});continue;}
        const day=new Date().toISOString().slice(0,10);if(cursor.budgetDay!==day){cursor.budgetDay=day;cursor.downloadBytes=0;}
        const limit=Number(process.env.GSMUN_DRIVE_DAILY_GB ?? "25")*1e9;if(!Number.isFinite(limit) || limit<=0)throw new CmsError("Invalid Drive daily byte budget.",503);
        if((cursor.downloadBytes ?? 0)+Number(remote.size)>limit)throw new CmsError("The configured daily Drive download budget is reached. Retry on a later day.",429);
        cursor.downloadBytes=(cursor.downloadBytes ?? 0)+Number(remote.size);await checkpoint();
        const bytes=await client.download(remote.id);const after=await client.get(remote.id);
        if(bytes.length!==Number(remote.size) || createHash("md5").update(bytes).digest("hex")!==remote.md5Checksum || after.version!==remote.version || after.md5Checksum!==remote.md5Checksum)throw new CmsError("Drive file changed or its transfer was incomplete. Retry after the upload is stable.",409);
        let processedImage;
        try{processedImage=await processImage(bytes,remote.mimeType);}catch{await finish({status:"unsupported",error:"The source cannot be decoded as a valid single-frame JPEG, PNG or WebP within 50 megapixels and 32–16000 pixels per side. Convert/reselect the final photograph; no photo record was created."});continue;}
        const existing=await db.from("assets").select("id").eq("checksum",processedImage.checksum).eq("processing_status","ready").neq("id",job.upload_id).limit(1);schemaError(existing.error);
        if(existing.data?.length){await finish({status:"duplicate",error:"These exact original bytes already exist in the archive. Review the existing photo; no duplicate was imported."});continue;}
        held();await renew();const stored=await storeUpload(db,destination,{name:remote.name},bytes,processedImage);
        await finish({status:"imported",asset_id:stored.assetId,photo_id:stored.photoId,error:"",retry_at:null,byte_size:bytes.length,mime_type:remote.mimeType,filename:remote.name.slice(0,255),md5_checksum:remote.md5Checksum,source_version:remote.version});processed++;
      }catch(error){const message=error instanceof CmsError ? error.message : "Import failed. Retry the tracked job; existing bytes and records are retained.";await finish({status:message.startsWith("Duplicate warning:") ? "duplicate" : "failed",error:message,retry_at:new Date(Date.now()+Math.min(3600000,30000*2**Math.min(job.attempts,7))).toISOString()});}
      finally{release();}
    }
    return {busy:false,processed,scanning:cursor.queue.length>0 || cursor.failedFolders.length>0};
  }finally{clearInterval(timer);if(heartbeat)await heartbeat;const result=await db.from("drive_sync_state").update({lease_token:null,lease_expires_at:null}).eq("id","main").eq("lease_token",lease);schemaError(result.error);}
}
