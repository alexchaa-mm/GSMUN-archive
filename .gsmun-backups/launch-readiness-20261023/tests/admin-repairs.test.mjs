import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { moduleLoader } from "./helpers/load-typescript.mjs";
import { fakeDatabase } from "./helpers/fake-database.mjs";
import { UploadQueue } from "../lib/cms/upload-queue.ts";
import { reserveUploadSlot } from "../lib/cms/upload-slots.ts";

const load = moduleLoader({
  "server-only": "export {};",
  "next/server": "export class NextResponse extends Response { static json(value, init) { return Response.json(value, init); } static redirect(url) { return Response.redirect(url); } }",
  "@supabase/ssr": "export const createServerClient = () => globalThis.__cmsOffline.db;",
  "@supabase/supabase-js": "export const createClient = () => globalThis.__cmsOffline.db;",
  "next/headers": "export const cookies = async () => ({ getAll: () => [], set: () => {} });",
  [new URL("../lib/supabase/config", import.meta.url).href]: "export const supabaseConfig = () => globalThis.__cmsOffline.state.configured ? { url: 'http://127.0.0.1:9', key: 'offline-only' } : null;",
});
const { mutateAdminContent, listAdminContent } = await load("lib/cms/admin-operations.ts");
const { storeUpload, checkUploadDestination } = await load("lib/cms/upload-service.ts");
const { mutationSchema } = await load("lib/cms/model.ts");
const { normalizeBook, assetUrl } = await load("lib/cms/content-mapper.ts");
const values = { title: "Offline test book", short_title: "TEST", slug: "offline-test", committee_name: "Test committee", description: "Test description", sort_order: 90, physical_height: 2.15, physical_thickness: 0.24, presentation_variant: 0 };

async function fixture() {
  const fake = fakeDatabase(); globalThis.__cmsOffline = fake;
  const { id } = await mutateAdminContent(fake.db, { action: "create-book", values });
  const archive = fake.tables.archives[0];
  const section = (await mutateAdminContent(fake.db, { action: "create-section", values: { archive_id: archive.id, slug: "arrival", title: "ARRIVAL", sort_order: 10, status: "draft" } })).id;
  return { ...fake, id, archive, section };
}
const mutate = (fake, action) => mutateAdminContent(fake.db, mutationSchema.parse(action));

test("book/chapter creation, editing, explicit ordering and safe deletion persist in the contract store", async () => {
  const f = await fixture();
  assert.equal(f.tables.books[0].status, "draft"); assert.equal(f.tables.archives.length, 1);
  await mutate(f, { action: "edit-book", id: f.id, values: { ...values, title: "Edited title" } });
  assert.equal(f.tables.books[0].title, "Edited title");
  await assert.rejects(mutate(f, { action: "create-book", values }), /slug/);
  const second = await mutate(f, { action: "create-section", values: { archive_id: f.archive.id, slug: "speeches", title: "SPEECHES", sort_order: 20, status: "draft" } });
  await mutate(f, { action: "edit-section", id: second.id, values: { slug: "speeches", title: "Renamed chapter", sort_order: 20, status: "draft" } });
  await mutate(f, { action: "move", entity: "sections", id: second.id, beforeId: f.section });
  assert.equal(f.tables.sections.find(row => row.id === second.id).sort_order, 10);
  await mutate(f, { action: "delete", entity: "sections", id: second.id, confirmation: "DELETE" });
  assert.equal(f.tables.sections.length, 1);
  await assert.rejects(mutate(f, { action: "create-section", values: { archive_id: randomUUID(), slug: "wrong", title: "Wrong parent", sort_order: 1, status: "draft" } }), /parent/);
  await mutate(f, { action: "delete", entity: "books", id: f.id, confirmation: "DELETE" });
  assert.equal(f.tables.books.length, 0); assert.equal(f.tables.archives.length, 0); assert.equal(f.tables.sections.length, 0);
});

test("publication is explicit, non-cascading, and published metadata cannot be edited silently", async () => {
  const f = await fixture();
  await mutate(f, { action: "book-status", id: f.id, status: "published" });
  assert.equal(f.tables.archives[0].status, "published"); assert.equal(f.tables.sections[0].status, "draft");
  assert.equal(f.calls.find(call => call.rpc === "set_book_status").values.include_drafts, false);
  assert.equal(mutationSchema.safeParse({ action: "book-status", id: f.id, status: "published", includeDrafts: true }).success, false);
  await assert.rejects(mutate(f, { action: "edit-book", id: f.id, values }), /Unpublish/);
  await assert.rejects(mutate(f, { action: "delete", entity: "books", id: f.id, confirmation: "DELETE" }), /Unpublish/);
  await assert.rejects(mutate(f, { action: "create-section", values: { archive_id: f.archive.id, slug: "implicit", title: "Implicit", status: "published", sort_order: 20 } }), /drafts/);
  await mutate(f, { action: "item-status", entity: "sections", id: f.section, status: "published" });
  let mapped = normalizeBook(f.tables.books[0], f.tables.archives[0], f.tables.sections, [], []);
  assert.equal(mapped.sections.length, 1);
  await mutate(f, { action: "item-status", entity: "sections", id: f.section, status: "archived" });
  assert.equal(normalizeBook(f.tables.books[0], f.tables.archives[0], f.tables.sections, [], []).sections.length, 0);
  await mutate(f, { action: "book-status", id: f.id, status: "draft" });
  mapped = normalizeBook(f.tables.books[0], f.tables.archives[0], f.tables.sections, [], []);
  assert.equal(mapped, null); assert.equal(f.tables.books.length, 1);
});

test("actual listing service paginates/searches/filters/sorts a simulated 2,000-photo collection", async () => {
  const f = await fixture();
  f.tables.photos.push(...Array.from({ length: 2000 }, (_, index) => ({ id: `photo-${String(index).padStart(4, "0")}`, section_id: f.section, alt: `Delegate ${index}`, caption: index % 2 ? "Debate" : "Arrival", credit: "", status: index % 4 ? "draft" : "published", sort_order: index * 10, created_at: new Date(index * 10000).toISOString() })));
  const ids = [];
  for (let offset = 0; offset < 2000; offset += 48) {
    const page = await listAdminContent(f.db, new URLSearchParams({ entity: "photos", parent: f.section, offset: String(offset) }));
    assert.equal(page.count, 2000); assert.ok(page.data.length <= 48); ids.push(...page.data.map(row => row.id));
  }
  assert.equal(new Set(ids).size, 2000); assert.equal(f.state.maxReturned, 48);
  const filtered = await listAdminContent(f.db, new URLSearchParams({ entity: "photos", parent: f.section, search: "arrival", status: "published", sort: "newest" }));
  assert.equal(filtered.count, 500); assert.equal(filtered.data[0].id, "photo-1996");
  const other = await listAdminContent(f.db, new URLSearchParams({ entity: "photos", parent: "another-section" })); assert.equal(other.count, 0);
  for (const params of [{ entity: "photos" }, { entity: "photos", parent: f.section, offset: "NaN" }, { entity: "books", limit: "2000" }, { entity: "archive_admins" }]) await assert.rejects(listAdminContent(f.db, new URLSearchParams(params)));
  const injection = await listAdminContent(f.db, new URLSearchParams({ entity: "photos", parent: f.section, search: 'x"),status.eq.published' })); assert.equal(injection.count, 0);
});

function uploadInput(f, extra = {}) { return { id: randomUUID(), bookId: f.id, sectionId: f.section, photoId: null, kind: "photo", allowDuplicate: false, ...extra }; }
const bytes = Buffer.from("offline-test-original");
const processed = { mime: "image/jpeg", extension: "jpg", checksum: createHash("sha256").update(bytes).digest("hex"), width: 1200, height: 800, variants: [{ name: "thumbnail", bytes: Buffer.from("offline-test-thumbnail"), mime: "image/webp", width: 760, height: 507 }, { name: "viewer", bytes: Buffer.from("offline-test-viewer"), mime: "image/webp", width: 1200, height: 800 }] };

test("uploads retain storage relationships, retry partial transfers, and reconcile a lost success response", async () => {
  const f = await fixture(); const input = uploadInput(f);
  await checkUploadDestination(f.db, input);
  f.state.failStorage = key => key.endsWith("viewer.webp");
  await assert.rejects(storeUpload(f.db, input, { name: "conference.jpg" }, bytes, processed), /Retry/);
  assert.equal(f.tables.assets.length, 1); assert.equal(f.tables.assets[0].processing_status, "failed");
  assert.equal(f.objects.size, 2); assert.equal(f.tables.photos.length, 0);
  f.state.failStorage = null;
  const completed = await storeUpload(f.db, input, { name: "conference.jpg" }, bytes, processed);
  assert.equal(completed.assetId, input.id); assert.equal(f.objects.size, 3); assert.equal(f.tables.photos[0].status, "draft");
  assert.equal(f.tables.photos[0].section_id, f.section); assert.equal(f.tables.photos[0].asset_id, input.id);
  await storeUpload(f.db, input, { name: "conference.jpg" }, bytes, processed);
  assert.equal(f.tables.photos.length, 1); assert.equal(f.tables.assets.length, 1); assert.equal(f.objects.size, 3);
  await assert.rejects(storeUpload(f.db, input, { name: "wrong.jpg" }, Buffer.from("different bytes"), { ...processed, checksum: "different" }), /another file/);
  await assert.rejects(storeUpload(f.db, uploadInput(f), { name: "renamed.jpg" }, bytes, processed), /Duplicate warning/);
});

test("database-link failure keeps a ready, recoverable asset and creates no broken photo row", async () => {
  const f = await fixture(); const input = uploadInput(f);
  f.state.fail = (entity, mode) => entity === "photos" && mode === "insert";
  await assert.rejects(storeUpload(f.db, input, { name: "conference.jpg" }, bytes, processed));
  assert.equal(f.tables.assets[0].processing_status, "ready"); assert.equal(f.tables.photos.length, 0); assert.equal(f.objects.size, 3);
  f.state.fail = null; await storeUpload(f.db, input, { name: "conference.jpg" }, bytes, processed);
  assert.equal(f.tables.photos.length, 1); assert.equal(f.objects.size, 3);
  await assert.rejects(checkUploadDestination(f.db, { ...input, sectionId: "wrong-chapter" }));
  f.tables.photos[0].status = "published";
  await assert.rejects(checkUploadDestination(f.db, { ...input, id: randomUUID(), photoId: input.id, expectedAssetId: input.id }), /Unpublish/);
});

test("a pre-existing storage conflict is hash-verified, never overwritten or automatically removed", async () => {
  const f = await fixture(); const input = uploadInput(f);
  f.objects.set(`books/${f.id}/sections/${f.section}/${input.id}/original.jpg`, Buffer.from("unrelated original"));
  await assert.rejects(storeUpload(f.db, input, { name: "conference.jpg" }, bytes, processed), /Nothing was overwritten/);
  assert.equal(f.objects.size, 1); assert.equal(f.tables.photos.length, 0);
  assert.ok(f.calls.filter(call => call.upload).every(call => call.options.upsert === false));
});

test("upload queue bounds concurrency, continues after failure, retries with stable IDs and releases successful files", async () => {
  let active = 0; let maximum = 0; const failed = new Set(); const attempts = [];
  const queue = new UploadQueue(async (job, signal, progress) => {
    active++; maximum = Math.max(maximum, active); attempts.push(job.id); progress(100);
    try { await new Promise(resolve => setTimeout(resolve, 5)); if (job.name === "bad.jpg" && !failed.has(job.id)) { failed.add(job.id); throw new Error("Retry me"); } assert.equal(signal.aborted, false); }
    finally { active--; }
  }, () => {});
  const files = ["one.jpg", "bad.jpg", "three.jpg", "four.jpg"].map(name => new File([bytes], name, { type: "image/jpeg", lastModified: 1 }));
  queue.add([...files, files[0]]);
  await until(() => queue.jobs.filter(job => ["success", "failed"].includes(job.state)).length === 4);
  assert.equal(maximum, 2); assert.equal(queue.jobs.length, 4); assert.equal(queue.jobs.filter(job => job.state === "success").length, 3);
  const bad = queue.jobs.find(job => job.name === "bad.jpg"); queue.retry(bad.id);
  await until(() => queue.jobs.every(job => job.state === "success"));
  assert.equal(attempts.filter(id => id === bad.id).length, 2); assert.ok(queue.jobs.every(job => !job.file));
});

test("cancellation and reselecting files after reload preserve upload identities", async () => {
  const queue = new UploadQueue((job, signal) => new Promise((resolve, reject) => { signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }); }), () => {});
  const file = new File([bytes], "pending.jpg", { type: "image/jpeg", lastModified: 1 });
  queue.add([file]); await new Promise(resolve => setTimeout(resolve, 0)); queue.pause();
  await until(() => queue.jobs[0].state === "cancelled");
  const id = queue.jobs[0].id;
  const restored = new UploadQueue(async () => {}, () => {}, queue.receipts());
  assert.equal(restored.jobs[0].state, "needs-file"); restored.add([file]);
  await until(() => restored.jobs[0].state === "success"); assert.equal(restored.jobs[0].id, id);
});

test("decode slots are bounded per process and always releasable", () => {
  const first = reserveUploadSlot(); const second = reserveUploadSlot(); assert.equal(reserveUploadSlot(), null);
  first(); first(); const third = reserveUploadSlot(); assert.equal(typeof third, "function"); second(); third();
});

test("replacement retries do not overwrite a later artwork edit and preserve photo metadata", async () => {
  const f = await fixture(); const first = uploadInput(f);
  await storeUpload(f.db, first, { name: "original.jpg" }, bytes, processed);
  const photo = f.tables.photos[0]; photo.caption = "Keep this caption";
  const replacement = uploadInput(f, { photoId: photo.id, expectedAssetId: first.id });
  await checkUploadDestination(f.db, replacement); await storeUpload(f.db, replacement, { name: "replacement.jpg" }, bytes, processed);
  assert.equal(photo.caption, "Keep this caption"); assert.equal(photo.asset_id, replacement.id);
  photo.status = "published";
  await checkUploadDestination(f.db, replacement); await storeUpload(f.db, replacement, { name: "replacement.jpg" }, bytes, processed);
  assert.equal(f.tables.photos.length, 1);
  const artwork = uploadInput(f, { kind: "cover", sectionId: null, expectedAssetId: null });
  await checkUploadDestination(f.db, artwork); await storeUpload(f.db, artwork, { name: "cover.jpg" }, bytes, { ...processed, variants: [] });
  f.tables.books[0].cover_asset_id = randomUUID();
  await assert.rejects(checkUploadDestination(f.db, artwork), /changed since/);
});

test("book/photo reordering remains explicit and rejects a different parent scope", async () => {
  const f = await fixture();
  const second = await mutate(f, { action: "create-book", values: { ...values, slug: "second-book", sort_order: 100 } });
  await mutate(f, { action: "move", entity: "books", id: second.id, beforeId: f.id });
  assert.equal(f.tables.books.find(book => book.id === second.id).sort_order, 10);
  const one = uploadInput(f); const two = uploadInput(f, { allowDuplicate: true });
  await storeUpload(f.db, one, { name: "one.jpg" }, bytes, processed); await storeUpload(f.db, two, { name: "two.jpg" }, bytes, processed);
  await mutate(f, { action: "move", entity: "photos", id: two.id, beforeId: one.id });
  assert.equal(f.tables.photos.find(photo => photo.id === two.id).sort_order, 10);
  const otherArchive = f.tables.archives.find(archive => archive.book_id === second.id);
  const otherSection = await mutate(f, { action: "create-section", values: { archive_id: otherArchive.id, slug: "other", title: "Other", status: "draft", sort_order: 10 } });
  await assert.rejects(mutate(f, { action: "move", entity: "sections", id: f.section, beforeId: otherSection.id }));
});

test("all privileged content/upload endpoints reject anonymous and non-admin callers before parsing or writing", async () => {
  const content = await load("app/api/admin/content/route.ts"); const upload = await load("app/api/admin/upload/route.ts");
  for (const [role, status] of [["anonymous", 401], ["non-admin", 403]]) {
    const f = await fixture(); f.state.role = role;
    for (const [handler, path, method] of [[content.GET, "content", "GET"], [content.POST, "content", "POST"], [upload.POST, "upload", "POST"]]) {
      const response = await handler(new Request(`http://localhost/api/admin/${path}`, { method, headers: { origin: "http://localhost" }, ...(method === "POST" ? { body: "unreadable" } : {}) }));
      assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(f.objects.size, 0); assert.equal(f.tables.photos.length, 0);
  }
  const f = await fixture();
  assert.equal((await content.POST(new Request("http://localhost/api/admin/content", { method: "POST", headers: { origin: "https://other.invalid" }, body: "{}" }))).status, 403);
  f.state.configured = false;
  assert.equal((await content.GET(new Request("http://localhost/api/admin/content"))).status, 503);
});

test("login/logout use the existing provider account, report unconfirmed email safely and never return session tokens", async () => {
  const login = await load("app/api/auth/login/route.ts"); const logout = await load("app/api/auth/logout/route.ts");
  const f = await fixture(); f.state.role = "anonymous";
  const request = () => new Request("http://localhost/api/auth/login", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ email: "offline@example.invalid", password: "offline-test-password" }) });
  f.state.loginError = { code: "email_not_confirmed", status: 400, message: "provider details must not leak" };
  let response = await login.POST(request()); assert.equal(response.status, 401); assert.match((await response.json()).error, /not confirmed/);
  f.state.loginError = { status: 429 }; response = await login.POST(request()); assert.equal(response.status, 429);
  f.state.loginError = null; response = await login.POST(request()); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  response = await logout.POST(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { origin: "http://localhost" } }));
  assert.equal(response.status, 200); assert.equal(f.state.role, "anonymous"); assert.equal(f.state.signOuts, 1);
  f.db.auth.signInWithPassword = async () => { f.state.role = "non-admin"; return { error: null }; };
  response = await login.POST(request()); assert.equal(response.status, 403); assert.equal(f.state.role, "anonymous");
});

test("demo image references cannot reach public normalization, preview or local fallback", async () => {
  const { getPublishedBooks } = await load("app/local-content.ts");
  const books = await getPublishedBooks(); assert.equal(books.length, 8); assert.equal(books.reduce((n, book) => n + book.sections.length, 0), 32);
  assert.ok(books.every(book => book.sections.every(section => section.photos.length === 0)));
  assert.equal(assetUrl({ id: "demo", source_url: "https://images.unsplash.com/demo", processing_status: "ready" }), undefined);
});

test("the reviewed import bundle is unchanged, draft-only, conflict-guarded and excludes all photography", async () => {
  const root = new URL("../.local/catalog-import-v1-no-demo/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  assert.equal(manifest.target_project, "lofuwoctrqjnnovbggxj");
  assert.deepEqual([manifest.data.books.length, manifest.data.archives.length, manifest.data.sections.length, manifest.data.assets.length, manifest.data.photos.length], [8, 8, 32, 24, 0]);
  assert.ok([...manifest.data.books, ...manifest.data.archives, ...manifest.data.sections].every(row => row.status === "draft"));
  const sql = await readFile(new URL("import-drafts.sql", root), "utf8");
  assert.equal(/https?:\/\/[^\s"']*unsplash|^\s*insert\s+into\s+(?:public\.)?photos/im.test(sql), false, "Import contains no demo URL or photo INSERT");
  assert.match(sql, /on conflict\s*\(id\)\s*do nothing/i); assert.match(sql, /raise exception/i);
  const catalog = await readFile(new URL("../app/catalog.ts", import.meta.url));
  assert.equal(createHash("sha256").update(catalog).digest("hex"), manifest.source_catalog_sha256);
  for (const asset of manifest.data.assets) {
    assert.equal(asset.source_url, null);
    const book = manifest.data.books.find(row => [row.cover_asset_id, row.spine_asset_id, row.back_asset_id].includes(asset.id));
    const kind = ["cover", "spine", "back"].find(kind => book[`${kind}_asset_id`] === asset.id);
    const artwork = await readFile(new URL(`../public/books/${book.id}/${kind}.webp`, import.meta.url));
    assert.equal(createHash("sha256").update(artwork).digest("hex"), asset.checksum);
  }
  // Text/checksum validation is not SQL execution or proof of a live import.
});

async function until(condition) {
  const deadline = Date.now() + 5000;
  while (!condition()) { if (Date.now() > deadline) throw new Error("Offline asynchronous test timed out."); await new Promise(resolve => setTimeout(resolve, 5)); }
}
