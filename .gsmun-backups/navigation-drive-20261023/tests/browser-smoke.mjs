import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.GSMUN_PLAYWRIGHT_MODULE ?? "playwright");
const base = process.env.GSMUN_TEST_URL ?? "http://127.0.0.1:5203/";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Offline browser smoke requires a loopback test server.");
const browser = await chromium.launch({
  executablePath: process.env.GSMUN_CHROME_PATH, headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-background-networking"],
});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const external = [];
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [width, height] of [[390,844],[393,852],[430,932],[1024,768],[1440,900]]) {
    await page.setViewportSize({ width, height });
    assert.equal((await page.goto(base, { waitUntil: "domcontentloaded" })).status(), 200);
    await page.locator(".press-experience.is-ready").waitFor({ timeout: 120000 });
    await page.getByTestId("inspect-active").click(); await page.getByTestId("committee-archive").waitFor();
    assert.equal(await page.locator(".archive-photo").count(), 0, "Demo photos must never appear.");
    assert.equal(await page.locator(".archive-section").count(), 4);
    await page.locator(".archive-chapters button").last().click(); await page.waitForTimeout(700);
    const metrics = await page.evaluate(() => ({
      overflow: document.querySelector(".committee-archive").scrollWidth > document.querySelector(".committee-archive").clientWidth,
      headerTop: document.querySelector(".archive-masthead").getBoundingClientRect().top,
      columns: getComputedStyle(document.querySelector(".archive-photo-grid")).gridTemplateColumns.split(" ").length,
    }));
    assert.equal(metrics.overflow, false); assert.equal(metrics.headerTop, 0);
    assert.equal(metrics.columns, width <= 780 ? 2 : width < 1100 ? 3 : 4);
    await page.getByTestId("archive-exit").click(); await page.getByTestId("committee-archive").waitFor({ state: "detached" });
    await page.locator(".shelf-index button").nth(1).click(); await page.waitForTimeout(2200);
    await page.getByTestId("inspect-active").click(); await page.getByTestId("committee-archive").waitFor();
    assert.match(await page.locator(".archive-hero h1").innerText(), /SOCHUM/);
    await page.getByTestId("archive-exit").click(); await page.getByTestId("committee-archive").waitFor({ state: "detached" });
    console.log(`PASS approved shelf/archive ${width} × ${height}: book selection, chapters, return, header, no overflow or demo photography`);
  }
  await page.goto(new URL("admin/login/", base).href);
  assert.match(await page.locator("main").innerText(), /Supabase is not configured/);
  assert.equal(await page.getByRole("button", { name: "Log in", exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log("PASS offline public browser smoke. No Supabase/network connection, live login, real-photo viewer or storage test performed.");
} finally { await browser.close(); }
