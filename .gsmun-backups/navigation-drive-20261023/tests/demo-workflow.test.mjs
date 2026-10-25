import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {suggestSlug} from "../lib/cms/slugs.ts";
import {UploadQueue} from "../lib/cms/upload-queue.ts";
import {moduleLoader} from "./helpers/load-typescript.mjs";
import {fakeDatabase} from "./helpers/fake-database.mjs";
const load=moduleLoader({"server-only":"export {};","next/server":"export class NextResponse extends Response {static json(value,init){return Response.json(value,init);}}","@supabase/ssr":"export const createServerClient=()=>globalThis.__cmsOffline.db;","@supabase/supabase-js":"export const createClient=()=>globalThis.__cmsOffline.db;","next/headers":"export const cookies=async()=>({getAll:()=>[],set:()=>{}});",[new URL("../lib/supabase/config",import.meta.url).href]:"export const supabaseConfig=()=>({url:'http://127.0.0.1:9',key:'offline-only'});"});
const values={title:"A new volume",short_title:"NEW",slug:"a-new-volume",committee_name:"Test only",description:"",sort_order:90,physical_height:2.15,physical_thickness:0.24,presentation_variant:0};

test("slug suggestions normalize names without deriving existing identity from titles",()=>{
  assert.equal(suggestSlug("The Debate"),"the-debate");
  assert.equal(suggestSlug("Crisis Committee — Weimar Republic, 1929"),"crisis-committee-weimar-republic-1929");
  assert.equal(suggestSlug("  Café & PEOPLE!!!  "),"cafe-people");assert.equal(suggestSlug(""),"");
  assert.ok(suggestSlug("A ".repeat(200)).length<=160);assert.ok(!suggestSlug("A ".repeat(200)).endsWith("-"));
});
test("slug uniqueness is checked before mutation, scoped per archive, with stable existing URLs",async()=>{
  const f=fakeDatabase();globalThis.__cmsOffline=f;
  const {mutateAdminContent}=await load("lib/cms/admin-operations.ts");const {slugAvailable}=await load("lib/cms/slug-service.ts");
  const id=(await mutateAdminContent(f.db,{action:"create-book",values})).id;
  const archive=f.tables.archives[0];
  assert.equal((await slugAvailable(f.db,{checkSlug:"books",slug:values.slug})).available,false);
  assert.equal((await slugAvailable(f.db,{checkSlug:"books",slug:values.slug,exclude:id})).available,true);
  await assert.rejects(mutateAdminContent(f.db,{action:"create-book",values}),/book URL slug is already used/);
  await mutateAdminContent(f.db,{action:"edit-book",id,values:{...values,title:"Renamed committee"}});assert.equal(f.tables.books[0].slug,values.slug);
  const sectionValues={archive_id:archive.id,title:"The Debate",slug:"the-debate",sort_order:10,status:"draft"};
  const section=(await mutateAdminContent(f.db,{action:"create-section",values:sectionValues})).id;
  await assert.rejects(mutateAdminContent(f.db,{action:"create-section",values:sectionValues}),/already used in this book/);
  const other=(await mutateAdminContent(f.db,{action:"create-section",values:{...sectionValues,title:"People",slug:"people"}})).id;
  await assert.rejects(mutateAdminContent(f.db,{action:"edit-section",id:other,values:{title:"Collision",slug:"the-debate",sort_order:20,status:"draft"}}),/already used/);
  const otherBook=(await mutateAdminContent(f.db,{action:"create-book",values:{...values,slug:"another-volume"}})).id;const anotherArchive=f.tables.archives.find(row=>row.book_id===otherBook);
  await mutateAdminContent(f.db,{action:"create-section",values:{...sectionValues,archive_id:anotherArchive.id}});
  await mutateAdminContent(f.db,{action:"edit-section",id:section,values:{title:"Debate renamed",slug:"the-debate",sort_order:10,status:"draft"}});
  assert.equal(f.tables.sections.find(row=>row.id===section).slug,"the-debate");
  f.tables.books.find(row=>row.id===id).status="published";
  await assert.rejects(mutateAdminContent(f.db,{action:"edit-book",id,values:{...values,slug:"changed"}}),/Unpublish/);
});
test("slug checks remain private and artwork listings exclude conference-photo assets",async()=>{
  const f=fakeDatabase();globalThis.__cmsOffline=f;
  f.tables.assets.push({id:randomUUID(),storage_key:"books/disec/artwork/id/cover.webp",processing_status:"ready"},{id:randomUUID(),storage_key:"books/_r2/bucket/books/disec/sections/section/id/original.jpg",processing_status:"ready"});
  const {listAdminContent}=await load("lib/cms/admin-operations.ts");
  const art=await listAdminContent(f.db,new URLSearchParams({entity:"assets",assetKind:"artwork"}));assert.equal(art.count,1);assert.ok(art.data[0].storage_key.includes("/artwork/"));
  const photos=await listAdminContent(f.db,new URLSearchParams({entity:"assets",assetKind:"photos"}));assert.equal(photos.count,1);
  const route=await load("app/api/admin/content/route.ts");
  for(const role of ["anonymous","non-admin"]){f.state.role=role;assert.equal((await route.GET(new Request("http://localhost/api/admin/content?checkSlug=books&slug=disec"))).status,role==="anonymous"?401:403);}
  f.state.role="admin";assert.equal((await route.GET(new Request("http://localhost/api/admin/content?checkSlug=sections&slug=debate"))).status,400);
});
test("a 300-file queue stays bounded and retries only its failed files",async()=>{
  let active=0,max=0;const attempts=new Map();
  const queue=new UploadQueue(async(job,signal,progress)=>{
    active++;max=Math.max(max,active);const attempt=(attempts.get(job.id) ?? 0)+1;attempts.set(job.id,attempt);
    try{await new Promise(resolve=>setTimeout(resolve,1));assert.equal(signal.aborted,false);progress(100);if(job.name==="conference-149.jpg" && attempt===1)throw new Error("Simulated interruption");}finally{active--;}
  },()=>{});
  queue.add(Array.from({length:300},(_,i)=>new File([String(i)],`conference-${i}.jpg`,{type:"image/jpeg",lastModified:1})));
  const wait=async condition=>{for(let i=0;i<1000;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,2));}throw new Error("Queue did not settle");};
  await wait(()=>queue.jobs.every(job=>["success","failed"].includes(job.state)));assert.equal(max,2);assert.equal(queue.jobs.filter(job=>job.state==="failed").length,1);
  const failed=queue.jobs.find(job=>job.state==="failed");queue.retry(failed.id);await wait(()=>queue.jobs.every(job=>job.state==="success"));
  assert.equal([...attempts.values()].reduce((a,b)=>a+b,0),301);assert.ok(queue.jobs.every(job=>!job.file));
});
