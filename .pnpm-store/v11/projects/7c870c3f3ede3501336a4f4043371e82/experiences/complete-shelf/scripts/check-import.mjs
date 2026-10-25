// Offline verification ONLY. No SQL, account connection, upload or publication.
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
const folder=new URL("../.local/catalog-import-v1-no-demo/",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("manifest.json",folder),"utf8"));
const upload=JSON.parse(await readFile(new URL("storage-upload-manifest.json",folder),"utf8"));
assert.equal(manifest.target_project,"lofuwoctrqjnnovbggxj");
assert.deepEqual([manifest.data.books.length,manifest.data.archives.length,manifest.data.sections.length,manifest.data.assets.length,manifest.data.photos.length],[8,8,32,24,0]);
for(const table of ["books","archives","sections","assets"]){const ids=manifest.data[table].map(row=>row.id);assert.equal(new Set(ids).size,ids.length);}
assert.ok([...manifest.data.books,...manifest.data.archives,...manifest.data.sections].every(row=>row.status==="draft"));
assert.ok(manifest.data.books.every(book=>book.published_at===null));
assert.ok(manifest.data.archives.every(archive=>manifest.data.books.some(book=>book.id===archive.book_id)));
assert.ok(manifest.data.sections.every(section=>manifest.data.archives.some(archive=>archive.id===section.archive_id)));
assert.ok(manifest.data.assets.every(asset=>!asset.source_url && !asset.thumbnail_url));
assert.doesNotMatch(JSON.stringify(manifest.data),/unsplash|https?:\/\//i);
assert.equal(upload.objects.length,24);
for(const entry of upload.objects){assert.equal(entry.overwrite,false);assert.equal(entry.transform,false);assert.equal(entry.bucket,"archive-assets");const bytes=await readFile(new URL(`../${entry.source}`,import.meta.url));assert.equal(bytes.length,entry.byte_size);assert.equal(createHash("sha256").update(bytes).digest("hex"),entry.sha256);}
for(const [path,hash]of [[manifest.source_catalog,manifest.source_catalog_sha256],[manifest.source_id_helper,manifest.source_id_helper_sha256]])assert.equal(createHash("sha256").update(await readFile(new URL(`../${path}`,import.meta.url))).digest("hex"),hash);
console.log("VERIFIED OFFLINE: unchanged 8-book / 8-archive / 32-chapter / 24-artwork draft bundle; zero photos/demo URLs; relationships, unique IDs, byte sizes and hashes match. No remote conflicts, SQL execution or live writes were checked.");
