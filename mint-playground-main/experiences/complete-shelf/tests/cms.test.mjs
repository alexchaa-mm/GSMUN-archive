import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { mutationSchema, validateUpload, assertSameOrigin } from "../lib/cms/model.ts";
import { normalizeBook } from "../lib/cms/content-mapper.ts";
import { seedBook, seedId } from "../scripts/seed-plan.mjs";
import { catalog } from "../app/catalog.ts";

test("CMS input validation rejects privilege injection and unsafe inputs", () => {
  const values = { title: "New volume", short_title: "NEW", slug: "new-volume", committee_name: "Test", description: "", sort_order: 90, physical_height: 2.15, physical_thickness: 0.24, presentation_variant: 0 };
  assert.equal(mutationSchema.parse({ action: "create-book", values: { ...values, status: "published", user_id: "attacker" } }).values.status, undefined);
  assert.equal(mutationSchema.safeParse({ action: "create-book", values: { ...values, physical_height: 100 } }).success, false);
  assert.equal(mutationSchema.safeParse({ action: "delete", entity: "books", id: "test" }).success, false);
  assert.equal(mutationSchema.safeParse({ action: "delete", entity: "archive_admins", id: "test", confirmation: "DELETE" }).success, false);
  assert.throws(() => validateUpload("image/heic", 100), /HEIC/);
  assert.throws(() => validateUpload("image/jpeg", 31 * 1024 * 1024), /30 MB/);
  assert.throws(() => assertSameOrigin(new Request("https://archive.test/api/admin/content", { headers: { origin: "https://evil.test" } })), /origin/);
  assert.doesNotThrow(() => assertSameOrigin(new Request("https://archive.test/api/admin/content", { headers: { origin: "https://archive.test" } })));
});

test("image processing preserves artwork and produces bounded photo variants", async () => {
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const { default: ts } = await import("typescript");
  const { default: sharp } = await import("sharp");
  const require = createRequire(import.meta.url);
  // Compile the actual helper in memory; Node's strip-types loader does not
  // resolve extensionless TypeScript imports like Next's bundler does.
  const source = (await readFile(new URL("../lib/cms/images.ts", import.meta.url), "utf8"))
    .replace('"sharp"', JSON.stringify(pathToFileURL(require.resolve("sharp")).href))
    .replace('"./model"', JSON.stringify(new URL("../lib/cms/model.ts", import.meta.url).href));
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { processImage } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  const original = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#084818" } }).png().toBuffer();
  const untouched = Buffer.from(original);
  const artwork = await processImage(original, "image/png", true);
  assert.deepEqual(original, untouched);
  assert.deepEqual(artwork.variants, []);
  assert.equal(artwork.width, 2000);
  const photograph = await processImage(original, "image/png");
  assert.deepEqual(photograph.variants.map(variant => [variant.name, variant.width, variant.height]), [["thumbnail",760,380],["viewer",2000,1000]]);
  await assert.rejects(processImage(original, "image/jpeg"), /valid single-frame/);
  await assert.rejects(processImage(Buffer.from("not-an-image"), "image/png"));
});

test("isolated in-memory PostgreSQL enforces admin-only mutations, publishing, storage visibility and atomic order", { skip: process.env.GSMUN_RUN_ISOLATED_SQL_TESTS !== "1" ? "Enable isolated PGlite tests; no external database is ever used." : false }, async () => {
  const db = new PGlite();
  try {
    // Supabase owns these platform schemas/roles; recreate only their contracts locally.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      grant select on storage.objects to anon;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/202610090001_archive_cms.sql", import.meta.url), "utf8"));
    const admin = "11111111-1111-4111-8111-111111111111";
    const outsider = "22222222-2222-4222-8222-222222222222";
    await db.exec(`insert into auth.users values ('${admin}'),('${outsider}'); insert into public.archive_admins(user_id) values ('${admin}');`);
    async function asRole(role, id = "") {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec(`set role ${role}`);
    }
    async function count(table) { return Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n); }
    await asRole("authenticated", outsider);
    assert.equal((await db.query("select public.is_archive_admin() ok")).rows[0].ok, false);
    await assert.rejects(db.query("select public.create_archive_book($1::jsonb)", [JSON.stringify({ title: "Attack", short_title: "ATTACK", slug: "attack" })]));
    await assert.rejects(db.query("insert into public.archive_admins(user_id) values ($1)", [outsider]));
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('archive-assets','books/attack/test.jpg')"));
    await asRole("authenticated", admin);
    const payload = { title: "Brand new volume", short_title: "NEW", slug: "brand-new-volume", committee_name: "Not in the source catalogue", description: "Created using the database", sort_order: 90, physical_height: 2.15, physical_thickness: 0.24, presentation_variant: 0 };
    const id = (await db.query("select public.create_archive_book($1::jsonb) id", [JSON.stringify(payload)])).rows[0].id;
    assert.ok(!catalog.some(book => book.id === id));
    const archive = (await db.query("select id from public.archives where book_id=$1", [id])).rows[0].id;
    for (const [index, slug] of ["arrival", "ceremony", "delegates"].entries()) await db.query("insert into public.sections(id,archive_id,slug,title,sort_order) values($1,$2,$1,$1,$3)", [slug, archive, (index + 1) * 10]);
    await db.query("select public.move_archive_item('sections','delegates','arrival')");
    assert.deepEqual((await db.query("select id from public.sections order by sort_order")).rows.map(row => row.id), ["delegates", "arrival", "ceremony"]);
    const asset1 = "33333333-3333-4333-8333-333333333333";
    const asset2 = "44444444-4444-4444-8444-444444444444";
    const key1 = `books/${id}/sections/arrival/photo1/original.jpg`;
    const key2 = `books/${id}/sections/arrival/photo2/original.jpg`;
    for (const [asset, key] of [[asset1,key1],[asset2,key2]]) {
      await db.query("insert into public.assets(id,storage_key,original_filename,mime_type,width,height,byte_size) values($1,$2,'test.jpg','image/jpeg',1200,800,100)", [asset,key]);
      await db.query("insert into storage.objects(bucket_id,name) values('archive-assets',$1)", [key]);
    }
    const photo1 = (await db.query("select public.attach_archive_photo('arrival',$1,'Photo one') id", [asset1])).rows[0].id;
    const photo2 = (await db.query("select public.attach_archive_photo('arrival',$1,'Photo two') id", [asset2])).rows[0].id;
    await db.query("update public.photos set caption='Conference caption',credit='Photographer' where id=$1", [photo1]);
    await db.query("select public.move_archive_item('photos',$1,$2)", [photo2, photo1]);
    assert.deepEqual((await db.query("select id from public.photos order by sort_order")).rows.map(row => row.id), [photo2,photo1]);
    await assert.rejects(db.query("delete from public.assets where id=$1", [asset1]), /foreign key/);
    await asRole("anon");
    for (const table of ["books","archives","sections","photos","assets"]) assert.equal(await count(table), 0, `Draft ${table} must be private`);
    assert.equal((await db.query("select count(*) n from storage.objects")).rows[0].n, 0);
    await assert.rejects(db.query("update public.books set title='Attack'"));
    await asRole("authenticated", outsider);
    assert.equal(await count("books"), 0);
    assert.equal((await db.query("update public.books set title='Attack' returning id")).rows.length, 0);
    await asRole("authenticated", admin);
    await db.query("select public.set_book_status($1,'published',true)", [id]);
    await asRole("anon");
    assert.equal(await count("books"), 1); assert.equal(await count("sections"), 3); assert.equal(await count("photos"), 2);
    assert.equal((await db.query("select count(*) n from storage.objects")).rows[0].n, 2);
    assert.equal((await db.query("select caption from public.photos where id=$1", [photo1])).rows[0].caption, "Conference caption");
    await asRole("authenticated", admin);
    await db.query("update public.sections set status='draft' where id='arrival'");
    await asRole("anon");
    assert.equal(await count("photos"), 0); assert.equal(await count("assets"), 0);
    await asRole("authenticated", admin);
    await db.query("select public.set_book_status($1,'draft',false)", [id]);
    await asRole("anon"); assert.equal(await count("books"), 0);
    await asRole("authenticated", admin); assert.equal(await count("books"), 1); assert.equal(await count("photos"), 2);
    const other = (await db.query("select public.create_archive_book($1::jsonb) id", [JSON.stringify({ ...payload, slug: "other-book" })])).rows[0].id;
    const otherArchive = (await db.query("select id from public.archives where book_id=$1", [other])).rows[0].id;
    await db.query("insert into public.sections(id,archive_id,slug,title) values('other-section',$1,'other','Other')", [otherArchive]);
    await assert.rejects(db.query("select public.move_archive_item('sections','arrival','other-section')"), /scope/);
    await db.query("select public.move_archive_item('books',$1,$2)", [other,id]);
    assert.deepEqual((await db.query("select id from public.books order by sort_order")).rows.map(row => row.id), [other,id]);
    await db.query("delete from public.books where id=$1", [id]);
    assert.equal(await count("photos"), 0);
    await db.query("delete from public.assets where id=$1", [asset1]);
    assert.equal(await count("books"), 1);
  } finally { await db.close(); }
});

test("seed mapping preserves the approved books and supports arbitrary database IDs/sections", () => {
  for (const book of catalog) {
    const row = { ...seedBook(book), status: "published", cover_asset_id: null, spine_asset_id: null, back_asset_id: null };
    const normalized = normalizeBook(row, { id: "archive", book_id: book.id, title: book.title, description: book.committeeName, status: "published" }, [], [], []);
    for (const field of ["id","slug","title","shortTitle","committeeName","description","sortOrder","height","thickness","presentationVariant","cover","accent","ink","motif","quote","quoteBy"]) assert.deepEqual(normalized[field], book[field], field);
  }
  const book = { ...seedBook(catalog[0]), id: "entirely-new-book", status: "published" };
  const archive = { id: "new-archive", book_id: book.id, title: "New archive", description: "New description", status: "published" };
  const sections = [{ id: "later", archive_id: archive.id, title: "Later", sort_order: 20, status: "published" }, { id: "first", archive_id: archive.id, title: "Arrival", sort_order: 10, status: "published" }, { id: "hidden", archive_id: archive.id, title: "Private", sort_order: 0, status: "draft" }];
  const asset = { id: "asset", storage_key: "books/new/test.jpg", processing_status: "ready", width: 1200, height: 800, variants:{viewer:{storage_key:"books/new/viewer.webp"},thumbnail:{storage_key:"books/new/thumbnail.webp"}} };
  const photos = [{ id: "photo", section_id: "first", asset_id: "asset", status: "published", sort_order: 10, alt: "Photo", caption: "Caption", credit: "", credit_url: "" }, { id: "draft-photo", section_id: "first", asset_id: "asset", status: "draft", sort_order: 0 }];
  const mapped = normalizeBook(book, archive, sections, photos, [asset]);
  assert.deepEqual(mapped.sections.map(section => section.id), ["first","later"]);
  assert.equal(mapped.sections[0].photos.length, 1);
  assert.equal(mapped.sections[0].photos[0].original, "/api/assets/asset?variant=original");
  assert.equal(normalizeBook({ ...book, status: "draft" }, archive, sections, photos, [asset]), null);
  assert.equal(normalizeBook({ ...book, status: "draft" }, archive, sections, photos, [asset], true).sections.length, 3);
  assert.equal(seedId("stable"), seedId("stable")); assert.notEqual(seedId("stable"), seedId("other"));
});

test("50 database-defined books use the existing engine layout without index-based identity", async () => {
  const { createBookContentProvider } = await import("../app/content-provider.ts");
  const { createVerticalSlotPositions, createMotionLayout } = await import("../app/book-motion.ts");
  const fixture = Array.from({ length: 50 }, (_,index) => {
    const row = { ...seedBook(catalog[0]), id: `new-db-book-${index}`, slug: `new-db-book-${index}`, title: `New book ${index}`, status: "published", sort_order: (50-index)*10, physical_height: index % 2 ? 2.5 : 1.5, physical_thickness: index % 2 ? 0.4 : 0.12 };
    return normalizeBook(row, { id: `archive-${index}`, book_id: row.id, title: row.title, description: "", status: "published" }, [], [], []);
  });
  const books = await createBookContentProvider(() => fixture).getPublishedBooks();
  assert.equal(books.length, 50);
  assert.equal(books[0].id, "new-db-book-49");
  const sizes = books.map(book => ({ width: 1.31 + book.presentationVariant * 0.018, height: book.height, thickness: book.thickness }));
  const slots = createVerticalSlotPositions(sizes);
  assert.equal(slots.length, 50);
  assert.ok(slots.every((y,index) => index === 0 || y < slots[index-1]));
  const layout = createMotionLayout(sizes);
  assert.ok(Number.isFinite(layout.rotationLaneZ));
});

test("public rendering stays locked and no privileged key enters runtime application code", async () => {
  const { createHash } = await import("node:crypto");
  const hashes = { "ShelfEngine.ts": "c5d02f44662c399e64c39baef e21e305f4e0ff6503c342bba8ec369730e4d2b2".replaceAll(" ",""), "book-motion.ts": "0ae9c529bfb6e9a764067a80e5d5159ddcb51f9454d1e6a4273632f71b67f86a", "cover-art.ts": "21d98d7765c7cd235032128c43de68b7113e1a942427138f74e3d43f8e772711", "globals.css": "8de1199bce64f340482e5c3a9be7c4cfd02fb108930ebcf9f878cc379675e03a" };
  for (const [file, expected] of Object.entries(hashes)) {
    let bytes=await readFile(new URL(`../app/${file}`, import.meta.url));
    if(file==="globals.css"){
      const css=bytes.toString();const selector=/\.browse-caption__author\s*\{[^}]*\}/;
      const rule=css.match(selector)?.[0];assert.ok(rule?.includes("font-family: var(--sans)"),"Only the requested description family may change");
      bytes=Buffer.from(css.replace(selector,rule.replace("font-family: var(--sans)","font-family: var(--serif)")));
    }
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, `Locked public file changed: ${file}`);
  }
  const server = await readFile(new URL("../lib/supabase/server.ts", import.meta.url), "utf8");
  assert.match(server, /auth\.getUser\(\)/); assert.match(server, /is_archive_admin/);
  assert.doesNotMatch(server, /SERVICE_ROLE/);
  const response = await fetch(`${process.env.TEST_SITE_URL}api/admin/content/`);
  assert.equal(response.status, 503);
  const login = await fetch(`${process.env.TEST_SITE_URL}admin/login/`);
  assert.equal(login.status, 200); assert.match(await login.text(), /Supabase is not configured/);
});

test("standalone Drive routes do not trace source/environment/private-file directories into the release",async()=>{
  const trace=JSON.parse(await readFile(new URL("../.local/offline-next/server/app/api/admin/drive/route.js.nft.json",import.meta.url),"utf8"));
  assert.ok(trace.files.length>0);
  for(const path of trace.files)assert.doesNotMatch(path.replaceAll("\\","/"),/\/(?:\.env(?:\.[^/]*)?|next\.config\.ts|app\/ShelfEngine\.ts|\.gsmun-backups\/[^/]+|secrets\/[^/]+)$/,"Runtime private mounts and source directories must not be copied by filesystem tracing");
});
