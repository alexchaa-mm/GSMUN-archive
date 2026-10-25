import { createRequire } from "node:module";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.GSMUN_PLAYWRIGHT_MODULE ?? "playwright");
const base = process.env.GSMUN_TEST_URL ?? "http://127.0.0.1:5203/";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Offline browser smoke requires a loopback test server.");
const browser = await chromium.launch({
  executablePath: process.env.GSMUN_CHROME_PATH, headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-background-networking"],
});
const screenshots=fileURLToPath(new URL("../.local/navigation-browser/",import.meta.url));await mkdir(screenshots,{recursive:true});
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
    await page.locator(".loading-screen").waitFor({state:"hidden",timeout:120000});
    const hint=await page.locator(".shelf-intro").evaluate(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {center:r.x+r.width/2,top:r.top,inLayout:node.parentElement.classList.contains("shelf-guidance-region"),color:s.color,weight:s.fontWeight,family:s.fontFamily,events:s.pointerEvents};});assert.ok(Math.abs(hint.center-width/2)<1);assert.ok(hint.top>=0);assert.equal(hint.inLayout,true);assert.equal(hint.color,"rgb(255, 255, 255)");assert.equal(hint.weight,"800");assert.match(hint.family,/Inter/);assert.equal(hint.events,"none");
    if(width===390 || width===430 || width===1440)await page.screenshot({path:screenshots+`hint-${width}.png`});
    const description=await page.locator(".browse-caption__author").evaluate(node=>({family:getComputedStyle(node).fontFamily,style:getComputedStyle(node).fontStyle,color:getComputedStyle(node).color}));assert.match(description.family,/Inter/);assert.equal(description.style,"italic");assert.equal(description.color,"rgb(255, 168, 0)");
    const trigger=page.getByRole("button",{name:"Open archive navigation",exact:true});await trigger.click();const drawer=page.getByRole("dialog",{name:"Archive navigation",exact:true});await drawer.waitFor();assert.equal(await drawer.getByRole("link").count(),8);assert.equal(await drawer.getByText("Opening Ceremony",{exact:true}).count(),0);
    if(width===390 || width===1440){await page.waitForTimeout(300);await page.screenshot({path:screenshots+`drawer-${width}.png`});}
    await page.keyboard.press("Tab");assert.equal(await page.evaluate(()=>document.querySelector(".archive-drawer").contains(document.activeElement)),true);await page.keyboard.press("Escape");await drawer.waitFor({state:"hidden"});assert.equal(await trigger.evaluate(button=>button===document.activeElement),true);
    await trigger.click();await drawer.getByRole("link",{name:"SOCHUM",exact:true}).click();await drawer.waitFor({state:"hidden"});await page.waitForFunction(()=>document.querySelector(".browse-caption h1")?.textContent==="SOCHUM");assert.equal(await page.getByTestId("committee-archive").count(),0,"Focus navigation must not bypass the existing Open archive interaction");
    await page.locator(".shelf-index button").first().click();await page.waitForFunction(()=>document.querySelector(".browse-caption h1")?.textContent==="DISEC");
    const canvas=page.getByTestId("shelf-canvas");await canvas.dispatchEvent("wheel",{deltaY:70,deltaMode:0});await page.waitForTimeout(150);assert.ok(Number(await page.locator(".shelf-intro").evaluate(node=>getComputedStyle(node).opacity))<1,"Guidance fades on the existing canvas scroll without intercepting it");
    await page.locator(".shelf-index button").first().click();
    await page.getByTestId("inspect-active").click(); await page.getByTestId("committee-archive").waitFor();
    assert.equal(await page.locator(".archive-photo").count(), 0, "Demo photos must never appear.");
    assert.equal(await page.getByLabel("Find photographs",{exact:true}).count(),0);assert.equal(await page.getByRole("link",{name:"Search all volumes",exact:true}).count(),0);
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
    console.log(`PASS approved shelf/archive ${width} × ${height}: drawer/keyboard/focus, hint, italic Inter, book selection, chapters, return, no overflow or demo photography`);
  }
  await page.emulateMedia({reducedMotion:"reduce"});await page.goto(base);await page.locator(".press-experience.is-ready").waitFor();await page.getByRole("button",{name:"Open archive navigation",exact:true}).click();await page.keyboard.press("Escape");assert.equal(await page.locator(".archive-drawer").evaluate(node=>node.open),false);await page.emulateMedia({reducedMotion:"no-preference"});
  await page.getByRole("button",{name:"Open archive navigation",exact:true}).click();await page.mouse.click(20,450);await page.getByRole("dialog",{name:"Archive navigation"}).waitFor({state:"hidden"});
  await page.goto(new URL("admin/login/", base).href);
  assert.match(await page.locator("main").innerText(), /Supabase is not configured/);
  assert.equal(await page.getByRole("button", { name: "Log in", exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log("PASS offline public browser smoke. No Supabase/network connection, live login, real-photo viewer or storage test performed.");
} finally { await browser.close(); }
