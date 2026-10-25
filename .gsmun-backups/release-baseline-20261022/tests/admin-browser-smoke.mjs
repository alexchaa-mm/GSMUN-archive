import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { moduleLoader } from "./helpers/load-typescript.mjs";
import { fakeDatabase } from "./helpers/fake-database.mjs";

// Real React admin components + real route handlers, with a test-only contract
// store. Not a Supabase connection, real login/session or live persistence test.
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../.local/admin-browser-test/", import.meta.url));
await new Promise((resolve, reject) => webpack({
  mode: "production", context: root, entry: "./tests/fixtures/admin-browser-entry.tsx", output: { path: output, filename: "admin.js" },
  optimization: { minimize: false },
  resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "next/link$": fileURLToPath(new URL("./fixtures/browser-link.tsx", import.meta.url)) } },
  module: { rules: [{ test: /\.(?:tsx?|css)$/, exclude: /node_modules/, use: [{ loader: fileURLToPath(new URL("./helpers/browser-loader.cjs", import.meta.url)) }] }] },
  performance: false,
}, (error, stats) => error || stats?.hasErrors() ? reject(error ?? new Error(stats.toString({ all: false, errors: true }))) : resolve()));

const fake = fakeDatabase(); globalThis.__cmsOffline = fake; fake.state.role = "anonymous";
const load = moduleLoader({
  "server-only": "export {};",
  "next/server": "export class NextResponse extends Response { static json(value, init) { return Response.json(value, init); } static redirect(url) { return Response.redirect(url); } }",
  "@supabase/ssr": "export const createServerClient = () => globalThis.__cmsOffline.db;",
  "@supabase/supabase-js": "export const createClient = () => globalThis.__cmsOffline.db;",
  "next/headers": "export const cookies = async () => ({ getAll: () => [], set: () => {} });",
  [new URL("../lib/supabase/config", import.meta.url).href]: "export const supabaseConfig = () => ({ url: 'http://127.0.0.1:9', key: 'offline-only' });",
});
const content = await load("app/api/admin/content/route.ts"); const upload = await load("app/api/admin/upload/route.ts");
const login = await load("app/api/auth/login/route.ts"); const logout = await load("app/api/auth/logout/route.ts"); const assets = await load("app/api/assets/[id]/route.ts");
const app = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://127.0.0.1:${app.address().port}`);
    if (url.pathname === "/admin.js") { outgoing.setHeader("content-type", "text/javascript"); outgoing.end(await readFile(`${output}/admin.js`)); return; }
    if (!url.pathname.startsWith("/api/")) {
      if (!url.pathname.startsWith("/admin/login") && fake.state.role !== "admin") { outgoing.writeHead(302, { location: "/admin/login/" }); outgoing.end(); return; }
      outgoing.setHeader("content-type", "text/html"); outgoing.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/admin.js"></script></body></html>'); return;
    }
    const body = []; for await (const chunk of incoming) body.push(chunk);
    const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(body.length ? { body: Buffer.concat(body) } : {}) });
    let response;
    if (url.pathname.startsWith("/api/assets/")) response = await assets.GET(request, { params: Promise.resolve({ id: url.pathname.split("/")[3] }) });
    else {
      const route = ({ "/api/admin/content": content, "/api/admin/upload": upload, "/api/auth/login": login, "/api/auth/logout": logout })[url.pathname.replace(/\/$/, "")];
      response = route?.[incoming.method] ? await route[incoming.method](request) : new Response("Not found", { status: 404 });
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end("Offline test server error"); }
});
await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.address().port}`;
const { chromium } = require(process.env.GSMUN_PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({ executablePath: process.env.GSMUN_CHROME_PATH, headless: true, args: ["--disable-background-networking"] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
  await page.goto(`${base}/admin/`); await page.getByLabel("Email", { exact: true }).fill("offline@example.invalid"); await page.getByLabel("Password", { exact: true }).fill("offline-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click(); await page.waitForURL("**/admin/");
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await page.getByLabel("Book title", { exact: true }).fill("OFFLINE QA BOOK"); await page.getByLabel("Short title", { exact: true }).fill("QA");
  await page.getByLabel("URL slug", { exact: true }).fill("offline-qa-book"); await page.getByLabel("Full committee / subtitle").fill("Offline browser contract test");
  await page.getByLabel("Description", { exact: true }).fill("Not real archive content; exists only in an in-memory test double.");
  await page.getByRole("button", { name: "Create draft book", exact: true }).click();
  await page.getByRole("heading", { name: "Edit OFFLINE QA BOOK", exact: true }).waitFor(); assert.equal(fake.tables.books.length, 1);
  for (const [index, title] of ["ARRIVAL", "DEBATE", "PEOPLE"].entries()) {
    await page.getByRole("button", { name: "Add section", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill(title); await page.getByLabel("Slug", { exact: true }).fill(title.toLowerCase());
    await page.getByLabel("Order", { exact: true }).last().fill(String((index + 1) * 10));
    await page.getByRole("button", { name: "Save chapter", exact: true }).click();
    await page.getByRole("heading", { name: `Photographs · OFFLINE QA BOOK → ${title}`, exact: true }).waitFor();
  }
  assert.equal(fake.tables.sections.length, 3);
  const photoPanel = page.getByRole("heading", { name: "Photographs · OFFLINE QA BOOK → PEOPLE", exact: true }).locator("..");
  const image = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#084818" } }).png().toBuffer();
  const other = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#124020" } }).png().toBuffer();
  let transferFailed = false;
  fake.state.failStorage = key => { if (!transferFailed && key.endsWith("viewer.webp")) { transferFailed = true; return true; } return false; };
  await photoPanel.locator('input[type="file"][multiple]').setInputFiles([
    { name: "offline-one.png", mimeType: "image/png", buffer: image }, { name: "offline-two.png", mimeType: "image/png", buffer: other }, { name: "invalid.heic", mimeType: "image/heic", buffer: Buffer.from("not supported") },
  ]);
  await page.waitForFunction(() => document.querySelector('progress[aria-label="Overall upload progress"]') && !document.querySelector('progress[aria-label="Overall upload progress"]').parentElement.textContent.includes("uploading"));
  await photoPanel.getByRole("button", { name: "Retry failed files", exact: true }).click();
  await page.waitForFunction(() => document.body.textContent.includes("2 saved · 0 pending · 1 need attention"), null, { timeout: 30000 });
  assert.equal(fake.tables.photos.length, 2); assert.equal(fake.tables.assets.length, 2); assert.ok(fake.tables.photos.every(photo => photo.status === "draft"));
  await photoPanel.getByLabel("Caption (optional)", { exact: true }).first().fill("Saved browser caption");
  await photoPanel.getByRole("button", { name: "Save photo details", exact: true }).first().click();
  await page.getByText("Server confirmed the operation. Lists have been refreshed.").waitFor();
  assert.ok(fake.tables.photos.some(photo => photo.caption === "Saved browser caption"));
  const people = fake.tables.sections.find(section => section.title === "PEOPLE");
  const assetId = fake.tables.photos[0].asset_id;
  fake.tables.photos.push(...Array.from({ length: 2000 }, (_, index) => ({ id: randomUUID(), section_id: people.id, asset_id: assetId, alt: `Attendee ${index}`, caption: "", credit: "", credit_url: "", status: index % 2 ? "draft" : "published", sort_order: 100 + index * 10, created_at: new Date(index * 10000).toISOString(), updated_at: new Date(index * 10000).toISOString() })));
  await photoPanel.getByRole("button", { name: "Search", exact: true }).click();
  await photoPanel.getByText("1–48 of 2002", { exact: true }).waitFor();
  assert.equal(await photoPanel.getByLabel("Select photograph", { exact: true }).count(), 48);
  await photoPanel.getByRole("button", { name: "Next page", exact: true }).click(); await photoPanel.getByText("49–96 of 2002", { exact: true }).waitFor();
  await photoPanel.getByLabel("Search", { exact: true }).fill("Attendee 1999"); await photoPanel.getByRole("button", { name: "Search", exact: true }).click();
  await photoPanel.getByText("1–1 of 1", { exact: true }).waitFor();
  await photoPanel.getByRole("button", { name: "Select this page", exact: true }).click(); await photoPanel.getByRole("button", { name: "Publish selected", exact: true }).click();
  await page.getByText("Server confirmed the operation. Lists have been refreshed.").waitFor(); assert.equal(fake.tables.photos.find(photo => photo.alt === "Attendee 1999").status, "published");
  await page.reload(); await page.getByRole("button", { name: "Edit / sections / photos", exact: true }).click();
  await page.getByRole("heading", { name: "Edit OFFLINE QA BOOK", exact: true }).waitFor(); assert.equal(fake.tables.sections.length, 3);
  await page.getByRole("button", { name: "Back to books", exact: true }).click(); await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Unpublish", exact: true }).waitFor(); assert.ok(fake.tables.sections.every(section => section.status === "draft"));
  await page.getByRole("button", { name: "Unpublish", exact: true }).click(); await page.getByRole("button", { name: "Publish", exact: true }).waitFor();
  await page.getByRole("button", { name: "Log out", exact: true }).click(); await page.waitForURL("**/admin/login/"); assert.equal(fake.state.role, "anonymous");
  assert.deepEqual(errors, []);
  console.log("PASS offline React admin: login/logout contracts, new book, three chapters, upload/failed-file retry, caption save, refresh persistence in test store, 2,002-row pagination/search/bulk status, non-cascading publication. No live Supabase operation performed.");
} finally { await browser.close(); await new Promise(resolve => app.close(resolve)); }
