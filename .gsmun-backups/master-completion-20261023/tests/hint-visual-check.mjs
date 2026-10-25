import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
const require=createRequire(import.meta.url);const {chromium}=require(process.env.GSMUN_PLAYWRIGHT_MODULE ?? "playwright");
const base=process.env.GSMUN_TEST_URL || "http://127.0.0.1:5211/";if(new URL(base).hostname!=="127.0.0.1")throw new Error("Loopback offline preview only.");
const browser=await chromium.launch({executablePath:process.env.GSMUN_CHROME_PATH,headless:true,args:["--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--disable-background-networking"]});
const output=fileURLToPath(new URL("../.local/navigation-browser/",import.meta.url));await mkdir(output,{recursive:true});
try{const context=await browser.newContext();await context.route("**/*",route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());const page=await context.newPage();
  for(const [width,height] of [[390,844],[430,932],[1440,900]]){await page.setViewportSize({width,height});await page.goto(base);await page.locator(".press-experience.is-ready").waitFor({timeout:120000});await page.locator(".loading-screen").waitFor({state:"hidden",timeout:120000});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:output+`hint-${width}.png`});
    const layout=await page.evaluate(()=>{const hint=document.querySelector(".shelf-intro"),rect=hint.getBoundingClientRect(),header=document.querySelector(".site-header").getBoundingClientRect();return {center:rect.x+rect.width/2,top:rect.top,bottom:rect.bottom,headerBottom:header.bottom,opacity:getComputedStyle(hint).opacity,overflow:document.documentElement.scrollWidth>innerWidth};});assert.ok(Math.abs(layout.center-width/2)<1);assert.ok(layout.top>layout.headerBottom);assert.equal(layout.opacity,"1");assert.equal(layout.overflow,false);console.log(`PASS fully rendered hint ${width}×${height}: centered, below header, no overflow.`);
  }
  if(process.env.GSMUN_CHECK_ADMIN_SANDBOX==="1"){
    const adminBase="http://127.0.0.1:5210";const admin=await browser.newContext();await admin.route("**/*",route=>new URL(route.request().url()).origin===adminBase?route.continue():route.abort());const adminPage=await admin.newPage();await adminPage.goto(adminBase+"/admin/");await adminPage.getByRole("button",{name:"Enter simulated administrator",exact:true}).click();await adminPage.waitForURL("**/admin/");assert.equal((await admin.request.get(adminBase+"/admin/")).status(),200);assert.equal((await adminPage.goto(adminBase+"/admin/shelf/")).status(),200);await adminPage.locator(".press-experience.is-ready").waitFor({timeout:120000});await adminPage.locator(".loading-screen").waitFor({state:"hidden",timeout:120000});console.log("PASS existing localhost admin and authenticated private shelf routes: HTTP 200, Three.js ready (simulated login only).");await admin.close();
  }
}finally{await browser.close();}
