import assert from "node:assert/strict";
import test from "node:test";
import {createHash,randomUUID} from "node:crypto";
import {mkdtemp,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {moduleLoader} from "./helpers/load-typescript.mjs";
import {fakeDatabase} from "./helpers/fake-database.mjs";
const load=moduleLoader({"server-only":"export {};","next/server":"export class NextResponse extends Response {static json(value,init){return Response.json(value,init);}}","@supabase/ssr":"export const createServerClient=()=>globalThis.__cmsOffline.db;","@supabase/supabase-js":"export const createClient=()=>globalThis.__cmsOffline.db;","next/headers":"export const cookies=async()=>({getAll:()=>[],set:()=>{}});",[new URL("../lib/supabase/config",import.meta.url).href]:"export const supabaseConfig=()=>({url:'http://127.0.0.1:9',key:'offline-only'});"});
const {navigationSchema,defaultNavigation,buildNavigation,publishedNavigationConfig}=await load("lib/cms/navigation.ts");
const {saveNavigation,publicNavigation,adminNavigation}=await load("lib/cms/navigation-service.ts");
const {syncDrive,driveUploadId,folderDestination,retryDriveJob}=await load("lib/cms/drive-import.ts");
const {driveAdminState,saveDriveMapping}=await load("lib/cms/drive-admin.ts");
const {verifyWorkerRequest,workerStatus,disableWorker,workerDatabase}=await load("lib/cms/drive-worker.ts");
const {privateServerPath,googleDriveClient}=await load("lib/cms/drive-client.ts");
const {mutateAdminContent}=await load("lib/cms/admin-operations.ts");
const bookValues={title:"DISEC",short_title:"DISEC",slug:"disec",committee_name:"Disarmament",description:"Offline fixture only",sort_order:10,physical_height:2.15,physical_thickness:0.24,presentation_variant:0};
function restoreEnvironment(saved,names){for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
async function fixture(){const fake=fakeDatabase();globalThis.__cmsOffline=fake;const book=await mutateAdminContent(fake.db,{action:"create-book",values:bookValues});const archive=fake.tables.archives[0];const chapter=await mutateAdminContent(fake.db,{action:"create-section",values:{archive_id:archive.id,title:"THE ROOM",slug:"the-room",sort_order:10,status:"draft"}});return {...fake,bookId:book.id,chapterId:chapter.id};}
function remote(f,options={}){
  const files=new Map();const bytes=new Map();const calls=[];const root="selected_root";const folder="book_folder";const chapter="chapter_folder";
  files.set(root,{id:root,name:"Final selections",mimeType:"application/vnd.google-apps.folder"});files.set(folder,{id:folder,name:"DISEC",mimeType:"application/vnd.google-apps.folder",parents:[root]});files.set(chapter,{id:chapter,name:options.chapterName ?? "THE ROOM",mimeType:"application/vnd.google-apps.folder",parents:[folder]});
  const client={get:async id=>{calls.push(["get",id]);const value=files.get(id);if(!value)throw new Error("missing simulated source");return structuredClone(value);},list:async(parent,page)=>{calls.push(["list",parent,page]);return {files:[...files.values()].filter(file=>file.parents?.includes(parent) && !file.trashed).map(file=>structuredClone(file))};},download:async id=>{calls.push(["download",id]);if(options.failDownload?.(id))throw new Error("simulated interrupted download");return Buffer.from(bytes.get(id));},startToken:async()=>"cursor1",changes:async()=>({changes:[],newStartPageToken:"cursor2"})};
  async function add(id="photo1",color="#104532",mime="image/png"){const data=await sharp({create:{width:128,height:96,channels:3,background:color}}).png().toBuffer();bytes.set(id,data);files.set(id,{id,name:`${id}.png`,mimeType:mime,size:String(data.length),parents:[chapter],md5Checksum:createHash("md5").update(data).digest("hex"),version:"1",capabilities:{canDownload:true}});return data;}
  return {client,files,bytes,calls,root,folder,chapter,add};
}
const navBooks=[{id:"disec",slug:"disec",title:"DISEC",shortTitle:"DISEC",committeeName:"Disarmament",status:"published",archiveStatus:"published",sections:[{id:"room",title:"THE ROOM",status:"published"},{id:"secret",title:"Private",status:"draft"}]},{id:"ceremony",slug:"opening",title:"Opening Ceremony",shortTitle:"Opening Ceremony",committeeName:"",status:"published",archiveStatus:"published",sections:[]},{id:"draft",slug:"draft",title:"Private book",shortTitle:"Private",committeeName:"",status:"draft",archiveStatus:"draft",sections:[]}];
test("navigation uses only valid published destinations; labels, order, hidden suppression and focus/direct links",()=>{
  const defaults=buildNavigation(defaultNavigation(),navBooks);assert.deepEqual(defaults.groups.map(group=>group.title),["Committees","Ceremonies & Events"]);assert.equal(defaults.groups[0].entries[0].href,"/?focus=disec");assert.equal(defaults.groups[1].entries.length,1);
  const config=defaultNavigation();config.groups[0].entries=[{id:"custom",label:"Explore DISEC",visible:true,order:20,bookId:"disec",behavior:"focus"},{id:"chapter",label:"Room photos",visible:true,order:10,bookId:"disec",chapterId:"room",behavior:"open"},{id:"bad",label:"Private draft",visible:true,order:0,bookId:"draft",behavior:"open"}];
  const menu=buildNavigation(config,navBooks);assert.deepEqual(menu.groups[0].entries.map(entry=>entry.label),["Room photos","Explore DISEC"]);assert.equal(menu.groups[0].entries[0].href,"/?book=disec&chapter=room");
  config.groups[0].visible=false;assert.ok(!buildNavigation(config,navBooks).groups.some(group=>group.entries.some(entry=>entry.bookId==="disec")));
  assert.doesNotMatch(JSON.stringify(publishedNavigationConfig(config,navBooks)),/Explore DISEC|Private draft|Room photos/);
  const duplicate=defaultNavigation();duplicate.groups[1].id=duplicate.groups[0].id;assert.equal(navigationSchema.safeParse(duplicate).success,false);
  assert.equal(buildNavigation(config,navBooks.map(book=>({...book,status:"draft"}))).groups.length,0);
});
test("navigation draft/public saves persist with version conflicts; no content publication or mutation",async()=>{
  const f=await fixture();const config=defaultNavigation();config.groups[0].entries=[{id:"item",label:"My label",visible:true,order:10,bookId:f.bookId,behavior:"focus"}];
  await saveNavigation(f.db,{action:"draft",config,version:0});assert.equal((await adminNavigation(f.db)).draftVersion,1);assert.equal(f.tables.books[0].status,"draft");
  await assert.rejects(saveNavigation(f.db,{action:"publish",config,version:0}),/unavailable|unpublished/);await assert.rejects(saveNavigation(f.db,{action:"draft",config,version:0}),/another session/);
  f.tables.books[0].status="published";f.tables.archives[0].status="published";
  await saveNavigation(f.db,{action:"publish",config,version:0});f.state.role="anonymous";assert.equal((await f.db.from("archive_navigation").select("*")).data.length,1);assert.equal((await publicNavigation(f.db)).groups[0].entries[0].label,"My label");
  f.tables.books[0].status="draft";assert.equal((await publicNavigation(f.db)).groups.length,0);assert.equal(f.tables.photos.length,0);
});
test("Drive import preserves originals, generates variants, links correct chapter and always creates drafts",async()=>{
  const f=await fixture();const r=remote(f);const original=await r.add();const result=await syncDrive(f.db,r.client,r.root);assert.equal(result.processed,1);const photo=f.tables.photos[0];const asset=f.tables.assets[0];assert.equal(photo.section_id,f.chapterId);assert.equal(photo.status,"draft");assert.deepEqual(f.objects.get(asset.storage_key),original);assert.deepEqual(Object.keys(asset.variants),["thumbnail","viewer"]);assert.equal(f.tables.drive_import_jobs[0].status,"imported");
  await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos.length,1);assert.equal(r.calls.filter(([action])=>action==="download").length,1);
  f.state.role="anonymous";assert.equal((await f.db.from("photos").select("*")).data.length,0);assert.equal((await f.db.from("drive_import_jobs").select("*")).data.length,0);assert.equal((await f.db.from("assets").select("*")).data.length,0);
});
test("copies deduplicate by checksum; changed/moved/deleted sources never overwrite or withdraw archive photos",async()=>{
  const f=await fixture();const r=remote(f);await r.add("photo1");await r.add("copy1");await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos.length,1);assert.equal(f.tables.drive_import_jobs.find(job=>job.drive_file_id==="copy1").status,"duplicate");
  const originalAsset={...f.tables.assets[0]};const photo=f.tables.photos[0];photo.status="published";
  await r.add("photo1","#ffa800");r.files.get("photo1").version="2";r.client.changes=async()=>({changes:[{file:r.files.get("photo1")},{removed:true,file:r.files.get("copy1")}],newStartPageToken:"cursor3"});await syncDrive(f.db,r.client,r.root);
  assert.equal(f.tables.drive_import_jobs.find(job=>job.drive_file_id==="photo1").status,"source_changed");assert.equal(f.tables.assets[0].checksum,originalAsset.checksum);assert.equal(photo.status,"published");assert.equal(f.tables.photos.length,1);
});
test("ambiguous/unknown folders require explicit mapping; artwork and unsupported files are not imported",async()=>{
  const f=await fixture();const r=remote(f,{chapterName:"Unknown chapter"});await r.add();await r.add("bad","#104532","image/heic");await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos.length,0);assert.equal(f.tables.drive_import_jobs[0].status,"needs_mapping");assert.equal(f.tables.drive_import_jobs[1].status,"unsupported");
  const books=[{id:f.bookId,slug:"disec",title:"DISEC",shortTitle:"DISEC",sections:[{id:f.chapterId,title:"THE ROOM"}]}];assert.equal(folderDestination(["DISEC","THE ROOM"],[...books,...books]),null);assert.equal(folderDestination(["DISEC","artwork"],books,{book_id:f.bookId,section_id:f.chapterId}),null);
  const before={...process.env};try{process.env.GSMUN_DRIVE_ENABLED="1";process.env.GSMUN_DRIVE_KEY_FILE="OFFLINE_NONEXISTENT";process.env.GSMUN_DRIVE_ROOT_FOLDER_ID=r.root;await saveDriveMapping(f.db,{folderId:r.chapter,bookId:f.bookId,sectionId:f.chapterId});await retryDriveJob(f.db,f.tables.drive_import_jobs[0].id,r.root);await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos[0].section_id,f.chapterId);}finally{restoreEnvironment(before,["GSMUN_DRIVE_ENABLED","GSMUN_DRIVE_KEY_FILE","GSMUN_DRIVE_ROOT_FOLDER_ID"]);}
});
test("partial storage/photo failures retry the SAME identity and verified bytes without duplicates",async()=>{
  const f=await fixture();const r=remote(f);await r.add();let fail=true;f.state.failStorage=key=>fail && key.endsWith("viewer.webp");await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos.length,0);const job=f.tables.drive_import_jobs[0];assert.equal(job.status,"failed");assert.equal(f.tables.assets[0].processing_status,"failed");const id=job.upload_id;fail=false;
  f.state.fail=(entity,mode)=>entity==="photos" && mode==="insert";await retryDriveJob(f.db,job.id,r.root);await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.assets[0].processing_status,"ready");assert.equal(f.tables.photos.length,0);assert.equal(job.status,"failed");
  f.state.fail=null;await retryDriveJob(f.db,job.id,r.root);await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos.length,1);assert.equal(f.tables.photos[0].id,id);assert.equal(f.tables.assets.length,1);assert.equal(f.objects.size,3);assert.equal(job.status,"imported");
});
test("incomplete transfers, unstable versions, moved sources and byte budget fail safely",async()=>{
  for(const kind of ["incomplete","version","moved","budget","unreadable"]){const f=await fixture();const r=remote(f);await r.add();
    if(kind==="incomplete")r.client.download=async()=>Buffer.from("truncated");
    if(kind==="unreadable"){const data=Buffer.from("invalid image");r.bytes.set("photo1",data);Object.assign(r.files.get("photo1"),{size:String(data.length),md5Checksum:createHash("md5").update(data).digest("hex")});}
    if(kind==="version"){let calls=0;const original=r.client.get;r.client.get=async id=>{const value=await original(id);if(id==="photo1" && ++calls>1)value.version="2";return value;};}
    if(kind==="moved"){const original=r.client.get;r.client.get=async id=>({...await original(id),...(id==="photo1"?{parents:["unrelated"]}:{})});}
    const previous=process.env.GSMUN_DRIVE_DAILY_GB;if(kind==="budget")process.env.GSMUN_DRIVE_DAILY_GB="0.000000001";
    try{await syncDrive(f.db,r.client,r.root);}finally{restoreEnvironment({GSMUN_DRIVE_DAILY_GB:previous},["GSMUN_DRIVE_DAILY_GB"]);}
    assert.equal(f.tables.photos.length,0,kind);assert.equal(f.tables.drive_import_jobs[0].status,kind==="unreadable"?"unsupported":"failed",kind);
  }
});
test("Drive scan pages/cursors survive ticks; expired change tokens reconcile and live leases prevent overlap",async()=>{
  const f=await fixture();const r=remote(f);await r.add();await syncDrive(f.db,r.client,r.root,{maxPages:1});assert.equal(f.tables.photos.length,0);await syncDrive(f.db,r.client,r.root,{maxPages:1});await syncDrive(f.db,r.client,r.root,{maxPages:1});assert.equal(f.tables.photos.length,1);
  const {CmsError}=await load("lib/cms/errors.ts");r.client.changes=async()=>{throw new CmsError("Expired cursor",410);};await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos.length,1);
  Object.assign(f.tables.drive_sync_state[0],{lease_token:randomUUID(),lease_expires_at:new Date(Date.now()+60000).toISOString()});const before=r.calls.length;assert.equal((await syncDrive(f.db,r.client,r.root)).busy,true);assert.equal(r.calls.length,before);
});
test("large Drive queues page status and do not let delayed retries starve new files",async()=>{
  const f=await fixture();const r=remote(f);await r.add();await syncDrive(f.db,r.client,r.root,{maxFiles:0});const real=f.tables.drive_import_jobs[0];
  f.tables.drive_import_jobs.unshift(...Array.from({length:2000},(_,i)=>({...real,id:randomUUID(),drive_file_id:`failed-${i}`,upload_id:randomUUID(),status:"failed",retry_at:new Date(Date.now()+3600000).toISOString(),created_at:"2020-01-01"})));
  await syncDrive(f.db,r.client,r.root);assert.equal(real.status,"imported");f.state.maxReturned=0;const page=await driveAdminState(f.db,{offset:48,status:"failed"});assert.equal(page.jobs.length,48);assert.equal(page.count,2000);assert.ok(f.state.maxReturned<=48);assert.equal(f.tables.photos.length,1);
});
test("every new privileged route enforces authentication/administrator/origin independently",async()=>{
  const f=await fixture();const nav=await load("app/api/admin/navigation/route.ts");const drive=await load("app/api/admin/drive/route.ts");const internal=await load("app/api/internal/drive-sync/route.ts");const readiness=await load("app/api/admin/readiness/route.ts");
  for(const role of ["anonymous","outsider"]){f.state.role=role;assert.equal((await readiness.GET(new Request("https://archive.test/api/admin/readiness?expectedProject=lofuwoctrqjnnovbggxj"))).status,role==="anonymous"?401:403);for(const route of [nav,drive]){assert.equal((await route.GET(new Request("https://archive.test/api/admin"))).status,role==="anonymous"?401:403);assert.equal((await route.POST(new Request("https://archive.test/api/admin",{method:"POST",headers:{origin:"https://archive.test","content-type":"application/json"},body:'{"action":"sync"}'}))).status,role==="anonymous"?401:403);}}
  f.state.role="admin";for(const route of [nav,drive])assert.equal((await route.POST(new Request("https://archive.test/api/admin",{method:"POST",headers:{origin:"https://evil.test"}}))).status,403);
  const response=await internal.POST(new Request("https://archive.test/api/internal/drive-sync",{method:"POST"}));assert.ok([401,503].includes(response.status));assert.equal(f.tables.drive_import_jobs.length,0);
});
test("worker credentials stay private, disabling never changes accounts, unconfigured Drive never connects",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"gsmun-worker-test-"));const path=join(directory,"private-session.json");const secret=join(directory,"private-secret.txt");await writeFile(secret,"offline-fixture-only-".repeat(4));
  process.env.GSMUN_DRIVE_WORKER_SESSION_FILE=path;process.env.GSMUN_DRIVE_WORKER_SECRET_FILE=secret;
  try{assert.deepEqual(await workerStatus(),{configured:true,authorized:false});await assert.rejects(verifyWorkerRequest(new Request("https://archive.test/")),/authorization/);await verifyWorkerRequest(new Request("https://archive.test/",{headers:{authorization:`Bearer ${await readFile(secret,"utf8")}`}}));await disableWorker();assert.equal((await workerStatus()).authorized,false);assert.deepEqual(JSON.parse(await readFile(path,"utf8")),{disabled:true});assert.throws(()=>privateServerPath(join(process.cwd(),"public","secret.json")),/Private credentials/);await assert.rejects(googleDriveClient(),/not connected/);}finally{delete process.env.GSMUN_DRIVE_WORKER_SESSION_FILE;delete process.env.GSMUN_DRIVE_WORKER_SECRET_FILE;}
});
test("stable Drive identities are deterministic per root/file, never filenames",()=>{assert.equal(driveUploadId("root","file"),driveUploadId("root","file"));assert.notEqual(driveUploadId("root","file"),driveUploadId("root2","file"));});
test("unattended worker revalidates user and admin membership and rotates only its private simulated credential",async()=>{
  const f=await fixture();const directory=await mkdtemp(join(tmpdir(),"gsmun-worker-auth-test-"));const path=join(directory,"session.json");process.env.GSMUN_DRIVE_WORKER_SESSION_FILE=path;
  try{
    const delegation={nonce:randomUUID(),userId:"existing-admin",refreshToken:"OFFLINE-fixture-token"};await writeFile(path,JSON.stringify(delegation));
    f.db.auth.refreshSession=async()=>({data:{session:{refresh_token:"OFFLINE-rotated-fixture-token"}},error:null});
    assert.equal(await workerDatabase(),f.db);assert.equal(JSON.parse(await readFile(path,"utf8")).refreshToken,"OFFLINE-rotated-fixture-token");assert.equal((await workerStatus()).authorized,true);
    f.state.role="outsider";await assert.rejects(workerDatabase(),/membership/);f.state.role="anonymous";await assert.rejects(workerDatabase(),/identity/);
    f.db.auth.refreshSession=async()=>({data:{session:null},error:{status:401}});await assert.rejects(workerDatabase(),/expired|revoked/);
    f.state.role="admin";let finishRefresh;let started;const waiting=new Promise(resolve=>{started=resolve;});f.db.auth.refreshSession=async()=>{started();return new Promise(resolve=>{finishRefresh=resolve;});};const pending=workerDatabase();await waiting;await disableWorker();finishRefresh({data:{session:{refresh_token:"OFFLINE-must-not-reactivate"}},error:null});await assert.rejects(pending,/authorization changed/);assert.deepEqual(JSON.parse(await readFile(path,"utf8")),{disabled:true});
    await disableWorker();await assert.rejects(workerDatabase(),/not authorized/);assert.equal(f.tables.books.length,1);assert.equal(f.tables.photos.length,0);
  }finally{delete process.env.GSMUN_DRIVE_WORKER_SESSION_FILE;}
});
test("incomplete Drive metadata retries automatically once bytes become stable, without a manual intervention",async()=>{
  for(const delivery of ["change-feed","poll-only"]){const f=await fixture();const r=remote(f);const bytes=await r.add();Object.assign(r.files.get("photo1"),{size:undefined,md5Checksum:undefined,version:undefined});await syncDrive(f.db,r.client,r.root);const job=f.tables.drive_import_jobs[0];assert.equal(job.status,"deferred");assert.equal(job.byte_size,0);assert.equal(f.tables.photos.length,0);
    await r.add();if(delivery==="change-feed")r.client.changes=async()=>({changes:[{file:r.files.get("photo1")}],newStartPageToken:"stable"});else job.retry_at="2000-01-01T00:00:00.000Z";
    await syncDrive(f.db,r.client,r.root);assert.equal(job.status,"imported");assert.equal(job.byte_size,bytes.length);assert.equal(f.tables.photos[0].status,"draft");assert.equal(f.tables.photos.length,1);
  }
});
test("an inaccessible child folder does not block new files or new folders from the change feed",async()=>{
  const f=await fixture();const r=remote(f);await r.add();r.files.set("inaccessible",{id:"inaccessible",name:"Private working folder",mimeType:"application/vnd.google-apps.folder",parents:[r.root]});const list=r.client.list;r.client.list=async(parent,page)=>{if(parent==="inaccessible")throw new Error("simulated permission denial");return list(parent,page);};
  await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos.length,1);assert.equal(f.tables.drive_sync_state[0].data.failedFolders.length,1);
  await r.add("photo2","#efb430");r.client.changes=async()=>({changes:[{file:r.files.get("photo2")}],newStartPageToken:"new-file"});await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos.length,2);
  const newFolder={id:"new-chapter",name:"THE ROOM",mimeType:"application/vnd.google-apps.folder",parents:[r.folder]};r.files.set(newFolder.id,newFolder);await r.add("photo3","#335599");r.files.get("photo3").parents=[newFolder.id];r.client.changes=async()=>({changes:[{file:newFolder},{file:r.files.get("photo3")}],newStartPageToken:"new-folder"});await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos.length,3);assert.ok(f.tables.photos.every(photo=>photo.section_id===f.chapterId && photo.status==="draft"));
});
test("lost completion and a partial asset recover from permanent storage even after the Drive file disappears",async()=>{
  for(const failure of ["completion","variant"]){const f=await fixture();const r=remote(f);const original=await r.add();let once=true;if(failure==="completion")f.state.fail=(entity,mode,value)=>{if(once && entity==="drive_import_jobs" && mode==="update" && value.status==="imported"){once=false;return true;}return false;};else f.state.failStorage=key=>key.endsWith("viewer.webp");
    await syncDrive(f.db,r.client,r.root);const job=f.tables.drive_import_jobs[0];assert.equal(job.status,"failed");const downloads=r.calls.filter(([type])=>type==="download").length;r.files.delete("photo1");f.state.fail=null;f.state.failStorage=null;await retryDriveJob(f.db,job.id,r.root);await syncDrive(f.db,r.client,r.root);
    assert.equal(job.status,"imported");assert.equal(f.tables.photos.length,1);assert.equal(f.tables.photos[0].status,"draft");assert.deepEqual(f.objects.get(f.tables.assets[0].storage_key),original);assert.equal(r.calls.filter(([type])=>type==="download").length,downloads,"A saved original must not be fetched from Drive again");
  }
});
test("a pending chapter folder moved under another book is flagged, never silently assigned to its old book",async()=>{
  const f=await fixture();const r=remote(f);await r.add();await syncDrive(f.db,r.client,r.root,{maxFiles:0});const next=await mutateAdminContent(f.db,{action:"create-book",values:{...bookValues,title:"CSW",short_title:"CSW",slug:"csw"}});const archive=f.tables.archives.find(archive=>archive.book_id===next.id);await mutateAdminContent(f.db,{action:"create-section",values:{archive_id:archive.id,title:"THE ROOM",slug:"room",sort_order:10,status:"draft"}});
  r.files.set("other-book-folder",{id:"other-book-folder",name:"CSW",mimeType:"application/vnd.google-apps.folder",parents:[r.root]});r.files.get(r.chapter).parents=["other-book-folder"];await syncDrive(f.db,r.client,r.root);assert.equal(f.tables.photos.length,0);assert.equal(f.tables.drive_import_jobs[0].status,"needs_mapping");assert.equal(f.tables.drive_import_jobs[0].book_id,f.bookId);assert.deepEqual(f.tables.drive_import_jobs[0].folder_path,["CSW","THE ROOM"]);
});
test("approved scoped verification processes only named files; other jobs remain drafts/queued",async()=>{
  const f=await fixture();const r=remote(f);await r.add("approved-qa");await r.add("not-approved","#ffa800");await syncDrive(f.db,r.client,r.root,{onlyFileIds:["approved-qa"]});assert.equal(f.tables.photos.length,1);assert.equal(f.tables.drive_import_jobs.find(job=>job.drive_file_id==="not-approved").status,"queued");assert.equal((await driveAdminState(f.db,{fileId:"approved-qa"})).count,1);await assert.rejects(syncDrive(f.db,r.client,r.root,{onlyFileIds:[]}),/verification/i);
});
test("Drive HTTP client uses read-only OAuth, fixed Google endpoints, bounded downloads and redacted retry errors",async()=>{
  const saved={...process.env};const originalFetch=globalThis.fetch;const directory=await mkdtemp(join(tmpdir(),"gsmun-google-http-test-"));const path=join(directory,"synthetic-account.json");
  await writeFile(path,JSON.stringify({type:"service_account",client_email:"offline@offline.iam.gserviceaccount.com",private_key:"OFFLINE PRIVATE KEY fixture",token_uri:"https://oauth2.googleapis.com/token"}));
  process.env.GSMUN_DRIVE_ENABLED="1";process.env.GSMUN_DRIVE_ROOT_FOLDER_ID="fixture-root";process.env.GSMUN_DRIVE_KEY_FILE=path;
  const scoped=moduleLoader({"server-only":"export {};","google-auth-library":"export class GoogleAuth {constructor(options){globalThis.__driveScopes=options.scopes;} async getAccessToken(){return 'OFFLINE-BEARER-NEVER-LOG';}}"});
  let calls=0;
  try{
    const {googleDriveClient}=await scoped("lib/cms/drive-client.ts");const client=await googleDriveClient();assert.deepEqual(globalThis.__driveScopes,["https://www.googleapis.com/auth/drive.readonly"]);
    globalThis.fetch=async(url,init)=>{calls++;assert.equal(new URL(url).origin,"https://www.googleapis.com");assert.equal(init.redirect,"error");assert.equal(init.headers.Authorization,"Bearer OFFLINE-BEARER-NEVER-LOG");if(calls===1)throw new Error("sensitive upstream socket detail");return Response.json({files:[]});};await client.list("fixture-folder");assert.equal(calls,2);
    globalThis.fetch=async()=>new Response("private upstream detail",{status:403});await assert.rejects(client.get("fixture-file"),error=>!error.message.includes("private upstream") && /permission/.test(error.message));
    globalThis.fetch=async()=>new Response("",{headers:{"content-length":String(31*1024*1024)}});await assert.rejects(client.download("fixture-file"),/30 MiB/);
    globalThis.fetch=async()=>{throw new Error("SECRET token");};await assert.rejects(client.get("fixture-file"),error=>/interrupted/.test(error.message) && !error.message.includes("SECRET"));
  }finally{globalThis.fetch=originalFetch;restoreEnvironment(saved,["GSMUN_DRIVE_ENABLED","GSMUN_DRIVE_ROOT_FOLDER_ID","GSMUN_DRIVE_KEY_FILE"]);delete globalThis.__driveScopes;}
});
