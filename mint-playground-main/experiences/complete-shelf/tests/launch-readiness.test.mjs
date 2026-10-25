import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {r2ConnectionConfig} from "../lib/cms/storage-config.mjs";
import {inspectLaunchConfig} from "../lib/cms/launch-readiness.mjs";
import {moduleLoader} from "./helpers/load-typescript.mjs";
import {livePlanSchema} from "../scripts/live-verification-plan.mjs";
const metadata=await moduleLoader()("app/archive-metadata.ts");
const {archiveDatabaseFetch}=await moduleLoader()("lib/supabase/request.ts");
const fixture={R2_ACCOUNT_ID:"a".repeat(32),R2_BUCKET:"offline-fixture",R2_ACCESS_KEY_ID:"OFFLINE-ONLY-ACCESS",R2_SECRET_ACCESS_KEY:"OFFLINE-ONLY-SECRET",NEXT_PUBLIC_SUPABASE_URL:"https://lofuwoctrqjnnovbggxj.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_OFFLINE_FIXTURE",GSMUN_OBJECT_STORAGE:"r2",GSMUN_PUBLIC_ORIGIN:"https://archive.example.test",GSMUN_STORAGE_LIMIT_GB:"35"};
test("share metadata uses the configured archive origin and existing identity, never template/demo photography",()=>{
  const result=metadata.archiveMetadata({GSMUN_PUBLIC_ORIGIN:"https://archive.example.test"});assert.equal(result.metadataBase.href,"https://archive.example.test/");assert.equal(result.openGraph.images[0].url,"/identity/gsmun-2026-digital-archive.png");assert.doesNotMatch(JSON.stringify(result),/mint\.gg|unsplash|token|secret/i);for(const origin of ["https://archive.example.test/path","https://user:password@archive.example.test","http://remote.example.test"])assert.throws(()=>metadata.archiveMetadata({GSMUN_PUBLIC_ORIGIN:origin}));
});
test("server database/Auth transport bounds stalled requests, preserves cancellation and never retries mutations",async()=>{
  const original=globalThis.fetch,previous=process.env.GSMUN_DATABASE_TIMEOUT_MS;let keepAlive;
  try{process.env.GSMUN_DATABASE_TIMEOUT_MS="1000";let options,calls=0;globalThis.fetch=async(_url,init)=>{calls++;options=init;return new Response("OK");};const controller=new AbortController();await archiveDatabaseFetch("https://offline.invalid",{method:"POST",signal:controller.signal});assert.equal(options.method,"POST");assert.equal(options.cache,"no-store");controller.abort();assert.equal(options.signal.aborted,true);assert.equal(calls,1);
    globalThis.fetch=(_url,init)=>new Promise((_,reject)=>init.signal.addEventListener("abort",()=>reject(new Error("Offline timeout fixture")),{once:true}));keepAlive=setTimeout(()=>{},2000);const began=Date.now();await assert.rejects(archiveDatabaseFetch("https://offline.invalid"),/timeout fixture/);assert.ok(Date.now()-began>=900 && Date.now()-began<1900);process.env.GSMUN_DATABASE_TIMEOUT_MS="0";assert.throws(()=>archiveDatabaseFetch("https://offline.invalid"),/GSMUN_DATABASE_TIMEOUT_MS/);
  }finally{globalThis.fetch=original;clearTimeout(keepAlive);if(previous===undefined)delete process.env.GSMUN_DATABASE_TIMEOUT_MS;else process.env.GSMUN_DATABASE_TIMEOUT_MS=previous;}
});
test("live verification needs explicit scoped approval; default invocation makes no requests",async()=>{
  const {execFile}=await import("node:child_process");const {promisify}=await import("node:util");const {stdout}=await promisify(execFile)(process.execPath,["scripts/verify-live-integration.mjs"]);assert.match(stdout,/PLAN ONLY/);
  const plan={approved:true,origin:"https://archive.example.test",expectedProject:"lofuwoctrqjnnovbggxj",bookId:"qa-book",chapterId:"qa-chapter",driveFileId:"qa-file",originalPath:"/private/qa.jpg",sha256:"a".repeat(64)};
  assert.equal(livePlanSchema.parse(plan).testPublication,false);for(const invalid of [{approved:false},{origin:"http://archive.example.test"},{origin:"https://archive.example.test/admin"},{maxSyncTicks:100},{serviceRole:"NEVER"},{driveFileId:"../anything"}])assert.equal(livePlanSchema.safeParse({...plan,...invalid}).success,false);
});
test("R2 jurisdiction endpoints and bounded timeouts fail closed without exposing configuration values",async()=>{
  assert.equal(r2ConnectionConfig(fixture).endpoint,`https://${fixture.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  for(const jurisdiction of ["eu","us","fedramp"])assert.equal(r2ConnectionConfig({...fixture,R2_JURISDICTION:jurisdiction}).endpoint,`https://${fixture.R2_ACCOUNT_ID}.${jurisdiction}.r2.cloudflarestorage.com`);
  for(const invalid of [{R2_JURISDICTION:"https://evil.test"},{GSMUN_R2_DELIVERY:"public"},{GSMUN_STORAGE_TIMEOUT_MS:"0"},{GSMUN_STORAGE_TIMEOUT_MS:"180001"},{R2_ACCESS_KEY_ID:"leak me"}])assert.throws(()=>r2ConnectionConfig({...fixture,...invalid}));
  const report=inspectLaunchConfig(fixture);assert.equal(report.ready,true);assert.equal(report.externalServicesVerified,false);assert.equal(report.drive.optionalForManualUploadLaunch,true);assert.doesNotMatch(JSON.stringify(report),/OFFLINE-ONLY|sb_publishable_OFFLINE|aaaaaaaa/);
  for(const invalid of [{GSMUN_DATABASE_TIMEOUT_MS:"0"},{GSMUN_CONTENT_SOURCE:"local"},{GSMUN_OFFLINE_VERIFY:"1"},{GSMUN_R2_DELIVERY:"signed"},{GSMUN_PUBLIC_ORIGIN:"http://archive.example.test"},{NEXT_PUBLIC_SUPABASE_URL:"https://wrong-project.supabase.co"}])assert.equal(inspectLaunchConfig({...fixture,...invalid}).ready,false);
  const ignored=await readFile(new URL("../Dockerfile.dockerignore",import.meta.url),"utf8");for(const pattern of ["**/.env*","**/*service-account*.json","**/*worker-secret*.txt","**/*worker-session*.json","**/*integration-approval*.json"])assert.ok(ignored.includes(pattern));assert.match(await readFile(new URL("../deploy/Caddyfile",import.meta.url),"utf8"),/respond \/api\/internal\/\* 404/);
});
test("production never silently substitutes the local published catalogue when cloud configuration is missing",async()=>{
  const saved={...process.env};const {databaseContentEnabled}=await moduleLoader()("lib/supabase/config.ts");
  try{process.env.NODE_ENV="production";delete process.env.GSMUN_OFFLINE_VERIFY;delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;delete process.env.GSMUN_CONTENT_SOURCE;assert.throws(databaseContentEnabled,/not configured/);process.env.GSMUN_CONTENT_SOURCE="local";assert.throws(databaseContentEnabled,/not configured/);process.env.GSMUN_OFFLINE_VERIFY="1";assert.equal(databaseContentEnabled(),false);}finally{for(const key of ["NODE_ENV","GSMUN_OFFLINE_VERIFY","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","GSMUN_CONTENT_SOURCE"]){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
test("four-table review migration enforces actual PostgreSQL RLS, destination ownership and duplicate constraints in memory",async()=>{
  const migration=await readFile(new URL("../supabase/migrations/20261023012405_navigation_drive_tracking.sql",import.meta.url),"utf8");assert.equal(migration,await readFile(new URL("../docs/sql/NAVIGATION-DRIVE-PROPOSAL.sql",import.meta.url),"utf8"));
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema public,auth,storage to anon,authenticated,service_role;grant select on storage.objects to anon;grant select,insert,update,delete on storage.objects to authenticated;`);
    await db.exec(await readFile(new URL("../supabase/migrations/202610090001_archive_cms.sql",import.meta.url),"utf8"));
    const admin="11111111-1111-4111-8111-111111111111",outsider="22222222-2222-4222-8222-222222222222";
    await db.exec(`insert into auth.users values('${admin}'),('${outsider}');insert into public.archive_admins(user_id) values('${admin}');`);
    const before=await db.query("select id,public from storage.buckets order by id");await db.exec(migration);assert.deepEqual(await db.query("select id,public from storage.buckets order by id"),before);
    assert.equal((await db.query("select count(*) n from public.archive_admins")).rows[0].n,1);
    async function role(name,user=""){await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${name}`);}
    await role("authenticated",admin);
    const payload=slug=>JSON.stringify({title:slug,short_title:slug,slug,sort_order:10,physical_height:2.15,physical_thickness:0.24,presentation_variant:0});
    const book=(await db.query("select public.create_archive_book($1::jsonb) id",[payload("one")])).rows[0].id;
    const other=(await db.query("select public.create_archive_book($1::jsonb) id",[payload("two")])).rows[0].id;
    const archive=(await db.query("select id from archives where book_id=$1",[book])).rows[0].id;
    await db.query("insert into sections(id,archive_id,slug,title) values('room',$1,'room','Room')",[archive]);
    await db.query("insert into archive_navigation(key,data,version) values('draft','{}',1),('published','{}',1)");
    await db.query("insert into drive_folder_mappings(id,root_id,book_id,section_id) values('folder','root',$1,'room')",[book]);
    await assert.rejects(db.query("update drive_folder_mappings set book_id=$1 where id='folder'",[other]),/does not belong/);
    const id="33333333-3333-4333-8333-333333333333";
    const jobSql="insert into drive_import_jobs(id,upload_id,drive_file_id,root_id,parent_id,folder_path,filename,mime_type,byte_size,status,book_id,section_id) values($1,$2,$3,'root','folder','[\"one\",\"room\"]','test.jpg','image/jpeg',100,'queued',$4,'room')";
    await db.query(jobSql,[id,id,"file",book]);
    await assert.rejects(db.query(jobSql,["44444444-4444-4444-8444-444444444444","44444444-4444-4444-8444-444444444444","file",book]),/unique/);
    await assert.rejects(db.query(jobSql,["44444444-4444-4444-8444-444444444444",id,"other-file",book]),/check|unique/);
    await assert.rejects(db.query("update drive_import_jobs set lease_token=$1 where id=$1",[id]),/check/);
    await db.query("insert into drive_sync_state(id,root_id,data) values('main','root','{}')");
    await assert.rejects(db.query("delete from drive_import_jobs where id=$1",[id]),/permission denied/);
    for(const [name,user] of [["anon",""],["authenticated",outsider]]){
      await role(name,user);assert.equal((await db.query("select key from archive_navigation")).rows.length,1);
      for(const table of ["drive_import_jobs","drive_folder_mappings","drive_sync_state"]){if(name==="anon")await assert.rejects(db.query(`select * from ${table}`),/permission denied/);else assert.equal((await db.query(`select * from ${table}`)).rows.length,0);}
      await assert.rejects(db.query("insert into archive_navigation(key,data,version) values('draft','{}',9)"),/permission denied|row-level security/);
      await assert.rejects(db.query("insert into drive_sync_state(id,root_id,data) values('main','root','{}')"),/permission denied|row-level security/);
    }
    await role("authenticated",admin);assert.equal((await db.query("select status from books where id=$1",[book])).rows[0].status,"draft");await db.query("delete from books where id=$1",[book]);assert.equal((await db.query("select * from drive_folder_mappings")).rows.length,0);assert.equal((await db.query("select book_id,section_id from drive_import_jobs")).rows[0].book_id,null);
    await role("postgres");await assert.rejects(db.exec(migration),/already exists/);await db.exec("rollback");assert.equal((await db.query("select count(*) n from archive_admins")).rows[0].n,1);
  }finally{await db.close();}
});
