import assert from "node:assert/strict";
import test from "node:test";
import { orderedArchiveSections, fetchPhotoDownload, photoFilename } from "../app/gallery-content.ts";

test("gallery accepts arbitrary ordered sections, empty chapters, and stable photo identity", () => {
  const source = [
    { id: "closing", title: "CLOSING CEREMONY", sortOrder: 30, photos: [] },
    { id: "arrival", title: "ARRIVAL", sortOrder: 10, photos: [{ id: "photo-7" }] },
  ];
  const result = orderedArchiveSections(source);
  assert.deepEqual(result.map((section) => section.id), ["arrival", "closing"]);
  assert.equal(source[0].id, "closing", "sorting must not mutate the content source");
  assert.equal(result[0].photos[0].id, "photo-7");
  assert.deepEqual(orderedArchiveSections([]), []);
});

test("download fetches image bytes and refuses missing or non-image assets", async (context) => {
  const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
  context.mock.method(globalThis, "fetch", async () => new Response(image));
  const blob = await fetchPhotoDownload("https://example.com/photo.webp");
  assert.equal(blob.type, "image/webp");
  assert.equal(blob.size, 3);
  assert.equal(photoFilename("disec/room-1", blob.type), "disec-room-1.webp");
  globalThis.fetch = async () => new Response("Missing", { status: 404 });
  await assert.rejects(fetchPhotoDownload("/missing.jpg"), /could not be downloaded/);
  globalThis.fetch = async () => new Response("<html>Error</html>", { headers: { "Content-Type": "text/html" } });
  await assert.rejects(fetchPhotoDownload("/bad.jpg"), /unavailable/);
});
