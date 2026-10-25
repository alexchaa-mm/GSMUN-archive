import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createHash,randomUUID} from "node:crypto";
import {moduleLoader} from "./helpers/load-typescript.mjs";
import {fakeDatabase} from "./helpers/fake-database.mjs";
import {seedBook} from "../scripts/seed-plan.mjs";
import {catalog} from "../app/catalog.ts";
import {photoFilename} from "../app/gallery-content.ts";
import {mkdtemp,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const overrides={"server-only":"export {};","next/server":"export class NextResponse extends Response {static json(value,init){return Response.json(value,init);}static redirect(url){return Response.redirect(url);}}","@supabase/ssr":"export const createServerClient=()=>globalThis.__cmsOffline.db;","@supabase/supabase-js":"export const createClient=()=>globalThis.__cmsOffline.db;","next/headers":"export const cookies=async()=>({getAll:()=>[],set:()=>{}});",[new URL("../lib/supabase/config",import.meta.url).href]:"export const supabaseConfig=()=>({url:'http://127.0.0.1:9',key:'offline-only'});"};
const load=moduleLoader(overrides);
function collection(size=5000){
  const f=fakeDatabase();globalThis.__cmsOffline=f;
  const book={...seedBook(catalog[0]),status:"published"};const archive={id:randomUUID(),book_id:book.id,title:book.title,description:book.committee_name,status:"published"};
  const section={id:randomUUID(),archive_id:archive.id,title:"THE DEBATE",slug:"debate",sort_order:10,status:"published"};
  f.tables.books.push(book);f.tables.archives.push(archive);f.tables.sections.push(section);
  for(let i=0;i<size;i++){
    const id=randomUUID();const prefix=`books/${book.id}/sections/${section.id}/${id}`;
    f.tables.assets.push({id,storage_key:`${prefix}/original.jpg`,source_url:null,original_filename:`GSMUN-${i}.jpg`,mime_type:"image/jpeg",byte_size:4000,checksum:null,processing_status:"ready",width:1200,height:800,variants:{thumbnail:{storage_key:`${prefix}/thumbnail.webp`,mime_type:"image/webp",byte_size:100,width:760,height:507},viewer:{storage_key:`${prefix}/viewer.webp`,mime_type:"image/webp",byte_size:200,width:1200,height:800}}});
    f.tables.photos.push({id,asset_id:id,section_id:section.id,alt:`Delegate ${i}`,caption:i%5 ? "Debate" : "Opening statement",credit:"GSMUN photographer",credit_url:"",sort_order:i*10,status:"published",created_at:new Date(i*1000).toISOString(),updated_at:new Date(i*1000).toISOString()});
  }
  return {...f,book,archive,section};
}

test("5,000-photo public listing is bounded, searchable, ordered and publication-aware",async()=>{
  const f=collection();f.state.role="anonymous";
  const {publicGalleryPage}=await load("lib/cms/public-gallery.ts");const {searchArchive}=await load("lib/cms/public-search.ts");const {getDatabaseBook}=await load("lib/cms/content.ts");
  const first=await publicGalleryPage(f.db,f.book.id,{});assert.equal(first.count,5000);assert.equal(first.photos.length,48);assert.equal(first.hasMore,true);
  const second=await publicGalleryPage(f.db,f.book.id,{offset:48});assert.equal(second.photos.length,48);assert.notEqual(first.photos[0].id,second.photos[0].id);
  assert.equal((await publicGalleryPage(f.db,f.book.id,{anchor:f.tables.photos[4200].id,direction:"next"})).photos[0].id,f.tables.photos[4201].id);
  assert.equal((await publicGalleryPage(f.db,f.book.id,{anchor:f.tables.photos[4200].id,direction:"previous"})).photos[0].id,f.tables.photos[4199].id);
  assert.match(first.photos[0].thumbnail,/variant=thumbnail/);assert.match(first.photos[0].original,/variant=original/);assert.match(first.photos[0].permalink,/book=disec/);
  assert.equal((await publicGalleryPage(f.db,f.book.id,{search:"Opening statement"})).count,1000);
  assert.equal((await publicGalleryPage(f.db,f.book.id,{search:"Disarmament"})).count,5000);
  assert.equal((await searchArchive(f.db,{search:"GSMUN 2026"})).count,5000);
  assert.equal((await searchArchive(f.db,{search:"Opening statement",book:"disec"})).photos.length,48);
  assert.equal((await searchArchive(f.db,{book:"not-this-book"})).count,0);
  const book=await getDatabaseBook(f.book.id,f.db);assert.equal(book.sections[0].photos.length,12);assert.equal(book.sections[0].totalPhotos,5000);assert.equal(book.sections[0].hasMore,true);assert.ok(f.state.maxReturned<=48);
  f.tables.photos[0].status="draft";assert.equal((await publicGalleryPage(f.db,f.book.id,{})).count,4999);
  f.section.status="archived";assert.equal((await publicGalleryPage(f.db,f.book.id,{})).count,0);
  f.section.status="published";f.book.status="draft";assert.equal(await publicGalleryPage(f.db,f.book.id,{}),null);assert.equal((await searchArchive(f.db,{})).count,0);
  f.state.role="admin";assert.equal((await publicGalleryPage(f.db,f.book.id,{},true)).count,5000);
  const {listAdminContent}=await load("lib/cms/admin-operations.ts");const last=await listAdminContent(f.db,new URLSearchParams({entity:"photos",parent:f.section.id,offset:"4992"}));assert.equal(last.count,5000);assert.equal(last.data.length,8);
});

test("assignment is explicit draft-only and filenames never alter stored bytes",async()=>{
  const f=collection(2);const {mutateAdminContent}=await load("lib/cms/admin-operations.ts");const {mutationSchema}=await load("lib/cms/model.ts");
  const next={...f.section,id:randomUUID(),title:"THE PEOPLE",status:"published"};f.tables.sections.push(next);
  const photo=f.tables.photos[0];const originalKey=f.tables.assets[0].storage_key;
  await assert.rejects(mutateAdminContent(f.db,{action:"assign-photo",id:photo.id,sectionId:next.id}),/Unpublish/);
  photo.status="draft";await mutateAdminContent(f.db,{action:"assign-photo",id:photo.id,sectionId:next.id});assert.equal(photo.section_id,next.id);assert.equal(photo.status,"draft");assert.equal(f.tables.assets[0].storage_key,originalKey);
  await mutateAdminContent(f.db,mutationSchema.parse({action:"rename-photo",id:photo.id,filename:"GSMUN - Delegate speech.jpg"}));assert.equal(f.tables.assets[0].original_filename,"GSMUN - Delegate speech.jpg");
  assert.equal(photoFilename(photo.id,"image/jpeg",f.tables.assets[0].original_filename),"GSMUN - Delegate speech.jpg");
  assert.equal(mutationSchema.safeParse({action:"rename-photo",id:photo.id,filename:"../../secret.jpg"}).success,false);
  await assert.rejects(mutateAdminContent(f.db,{action:"assign-photo",id:photo.id,sectionId:randomUUID()}));
});

test("storage admission includes derivatives and retained failures without uploading",async()=>{
  const f=collection(1);const {checkStorageBudget}=await load("lib/cms/storage-budget.ts");const old=process.env.GSMUN_STORAGE_LIMIT_GB;
  process.env.GSMUN_STORAGE_LIMIT_GB="0.000005";
  try{assert.equal((await checkStorageBudget(f.db,500)).used,4300);await assert.rejects(checkStorageBudget(f.db,1000),/budget/);f.tables.assets[0].processing_status="failed";await assert.rejects(checkStorageBudget(f.db,1000),/budget/);assert.equal(f.objects.size,0);}finally{if(old===undefined)delete process.env.GSMUN_STORAGE_LIMIT_GB;else process.env.GSMUN_STORAGE_LIMIT_GB=old;}
});

test("display cache is private and immutable; originals never enter it",async()=>{
  const {cachedVariant}=await load("lib/cms/media-cache.ts");const previous=process.env.GSMUN_MEDIA_CACHE_DIR;
  process.env.GSMUN_MEDIA_CACHE_DIR=await mkdtemp(join(tmpdir(),"gsmun-cache-test-"));let reads=0;const bytes=Buffer.from("local display-only fixture");
  try{assert.deepEqual(await cachedVariant("r2://bucket/books/test/viewer.webp",async()=>{reads++;return bytes;}),bytes);assert.deepEqual(await cachedVariant("r2://bucket/books/test/viewer.webp",async()=>{reads++;return bytes;}),bytes);assert.equal(reads,1);assert.equal(await cachedVariant("r2://bucket/books/test/original.jpg",async()=>{reads++;return bytes;}),null);assert.equal(reads,1);}finally{if(previous===undefined)delete process.env.GSMUN_MEDIA_CACHE_DIR;else process.env.GSMUN_MEDIA_CACHE_DIR=previous;}
});

test("trusted production origin and public-only Supabase credentials fail closed",async()=>{
  const {assertSameOrigin}=await load("lib/cms/model.ts");const {supabaseConfig}=await moduleLoader()('lib/supabase/config.ts');
  const names=["GSMUN_PUBLIC_ORIGIN","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try{process.env.GSMUN_PUBLIC_ORIGIN="https://archive.example";assert.doesNotThrow(()=>assertSameOrigin(new Request("http://archive:3000/api/admin/content",{headers:{origin:"https://archive.example",host:"archive.example"}})));assert.throws(()=>assertSameOrigin(new Request("http://archive:3000/api/admin/content",{headers:{origin:"https://archive.example",host:"evil.example"}})),/origin/);
    process.env.NEXT_PUBLIC_SUPABASE_URL="https://archive.supabase.co";process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_secret_offline-test";assert.throws(()=>supabaseConfig(),/privileged/);process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_offline-test";assert.ok(supabaseConfig());
  }finally{for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
});

test("new preview/search endpoints reject privilege escalation and invalid public requests",async()=>{
  const f=collection(1);const preview=await load("app/api/admin/gallery/route.ts");const search=await load("app/api/content/search/route.ts");
  const backup=await load("app/api/admin/export/route.ts");
  for(const [role,status]of [["anonymous",401],["non-admin",403]]){f.state.role=role;assert.equal((await preview.GET(new Request("http://localhost/api/admin/gallery?book=disec"))).status,status);assert.equal((await backup.GET()).status,status);}
  f.book.status="draft";const response=await search.GET(new Request("http://localhost/api/content/search?search=Delegate"));assert.equal(response.status,200);assert.equal((await response.json()).count,0);
  assert.equal((await search.GET(new Request(`http://localhost/api/content/search?search=${"x".repeat(121)}`))).status,400);
  f.state.role="admin";const exported=await backup.GET();assert.equal(exported.status,200);const manifest=await exported.json();assert.equal(manifest.includes_files,false);assert.equal(manifest.data.books[0].status,"draft");assert.equal(manifest.includes_auth_or_policies,false);
});

test("actual S3 SDK against loopback storage: conditional writes, original integrity, ranges, withdrawal and private previews",async()=>{
  const objects=new Map();let hits=0;
  const server=createServer(async(req,res)=>{
    hits++;assert.match(req.headers.authorization ?? "",/^AWS4-HMAC-SHA256 /);const key=new URL(req.url,"http://localhost").pathname;
    if(req.method==="PUT"){
      assert.equal(req.headers["if-none-match"],"*");if(objects.has(key)){res.writeHead(412,{"Content-Type":"application/xml"});res.end("<Error><Code>PreconditionFailed</Code></Error>");return;}
      const parts=[];for await(const chunk of req)parts.push(chunk);objects.set(key,Buffer.concat(parts));res.writeHead(200,{ETag:'"local-fixture"'});res.end();return;
    }
    const bytes=objects.get(key);if(!bytes){res.writeHead(404,{"Content-Type":"application/xml"});res.end("<Error><Code>NoSuchKey</Code></Error>");return;}
    let start=0,end=bytes.length-1;if(req.headers.range){const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range);start=Number(match[1]);if(match[2])end=Number(match[2]);res.setHeader("Content-Range",`bytes ${start}-${end}/${bytes.length}`);}
    const selected=bytes.subarray(start,end+1);res.writeHead(req.headers.range?206:200,{"Content-Length":selected.length,"Content-Type":"image/jpeg"});res.end(selected);
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  globalThis.__r2FixtureEndpoint=`http://127.0.0.1:${server.address().port}`;
  const names=["GSMUN_OBJECT_STORAGE","R2_ACCOUNT_ID","R2_BUCKET","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","GSMUN_R2_DELIVERY"];const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{GSMUN_OBJECT_STORAGE:"r2",R2_ACCOUNT_ID:"0".repeat(32),R2_BUCKET:"private-fixture",R2_ACCESS_KEY_ID:"offline-fixture-key",R2_SECRET_ACCESS_KEY:"offline-fixture-secret",GSMUN_R2_DELIVERY:"proxy"});
  const sdk=moduleLoader({...overrides,"@aws-sdk/client-s3":`import {S3Client as Actual,GetObjectCommand,PutObjectCommand} from ${JSON.stringify(import.meta.resolve("@aws-sdk/client-s3"))};export {GetObjectCommand,PutObjectCommand};export class S3Client extends Actual {constructor(options){super({...options,endpoint:globalThis.__r2FixtureEndpoint,forcePathStyle:true});}}`});
  try{
    const f=collection(1);const {assetStorage,storageKind}=await sdk("lib/cms/object-storage.ts");const storage=assetStorage(f.db);const reference=storage.location("books/disec/test/original.jpg");
    assert.equal(storageKind("books/disec/old/original.jpg"),"supabase");assert.equal(storageKind(reference),"r2");
    assert.equal(reference,"books/_r2/private-fixture/books/disec/test/original.jpg");
    const schema=await readFile(new URL("../supabase/migrations/202610090001_archive_cms.sql",import.meta.url),"utf8");
    assert.ok(schema.includes("storage_key ~ '^books/[a-zA-Z0-9_-]+/'"),"Recheck this compatibility test if the installed path constraint changes");
    assert.match(reference,/^books\/[a-zA-Z0-9_-]+\//,"Must satisfy the installed assets.storage_key CHECK without schema changes");
    const bytes=Buffer.from([255,216,255,1,2,3,4,255,217]);await storage.put(reference,bytes,"image/jpeg");await storage.put(reference,bytes,"image/jpeg");assert.equal(objects.size,1);
    await assert.rejects(storage.put(reference,Buffer.from("different file"),"image/jpeg"),/Nothing was overwritten/);
    await assert.rejects(storage.read("books/_r2/another-bucket/books/disec/test/original.jpg"),/different storage bucket/);
    const uploadId=randomUUID();const {storeUpload}=await sdk("lib/cms/upload-service.ts");
    const stored=await storeUpload(f.db,{id:uploadId,bookId:f.book.id,sectionId:f.section.id,kind:"photo",photoId:null,allowDuplicate:true},{name:"local-original.jpg"},bytes,{width:1200,height:800,mime:"image/jpeg",extension:"jpg",checksum:createHash("sha256").update(bytes).digest("hex"),variants:[{name:"thumbnail",bytes:Buffer.from("local-thumbnail"),mime:"image/webp",width:760,height:507},{name:"viewer",bytes:Buffer.from("local-viewer"),mime:"image/webp",width:1200,height:800}]});
    const persisted=f.tables.assets.find(asset=>asset.id===uploadId);assert.equal(stored.photoId,uploadId);assert.equal(persisted.processing_status,"ready");
    for(const key of [persisted.storage_key,...Object.values(persisted.variants).map(variant=>variant.storage_key)])assert.match(key,/^books\/_r2\/private-fixture\/books\//);
    assert.equal(f.tables.photos.find(photo=>photo.id===uploadId).status,"draft");
    let response=await storage.serve(reference,"image/jpeg","GSMUN delegate.jpg");const downloaded=Buffer.from(await response.arrayBuffer());assert.equal(createHash("sha256").update(downloaded).digest("hex"),createHash("sha256").update(bytes).digest("hex"));assert.match(response.headers.get("content-disposition"),/GSMUN delegate.jpg/);
    response=await storage.serve(reference,"image/jpeg",undefined,"bytes=1-3");assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(1,4));
    const asset=f.tables.assets[0];asset.storage_key=reference;asset.original_filename="GSMUN delegate.jpg";const route=await sdk("app/api/assets/[id]/route.ts");f.state.role="anonymous";
    response=await route.GET(new Request(`http://localhost/api/assets/${asset.id}?download=1`),{params:Promise.resolve({id:asset.id})});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    f.book.status="draft";const before=hits;response=await route.GET(new Request(`http://localhost/api/assets/${asset.id}`),{params:Promise.resolve({id:asset.id})});assert.equal(response.status,404);assert.equal(hits,before,"Withdrawn bytes must not reach storage");
    f.state.role="non-admin";assert.equal((await route.GET(new Request(`http://localhost/api/assets/${asset.id}`),{params:Promise.resolve({id:asset.id})})).status,404);
    f.state.role="admin";response=await route.GET(new Request(`http://localhost/api/assets/${asset.id}`),{params:Promise.resolve({id:asset.id})});assert.equal(response.status,200);await response.arrayBuffer();
    response=await storage.serve(storage.location("books/disec/missing/original.jpg"),"image/jpeg");assert.equal(response.status,404);
  }finally{for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}await new Promise(resolve=>server.close(resolve));}
});
