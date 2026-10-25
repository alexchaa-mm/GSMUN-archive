import {createRequire} from "node:module";
import {mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url);const {chromium}=require(process.env.GSMUN_PLAYWRIGHT_MODULE ?? "playwright");
const base=process.env.GSMUN_TEST_URL || "http://127.0.0.1:5211/";if(new URL(base).hostname!=="127.0.0.1")throw new Error("Offline loopback preview only.");
const browser=await chromium.launch({executablePath:process.env.GSMUN_CHROME_PATH,headless:true,args:["--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--disable-background-networking"]});
const output=fileURLToPath(new URL("../.local/hint-composition/",import.meta.url));await mkdir(output,{recursive:true});
async function drawing(page){return page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{const canvas=document.querySelector("canvas"),hint=document.querySelector(".shelf-intro"),r=hint.getBoundingClientRect(),style=getComputedStyle(hint);resolve({png:canvas.toDataURL(),hint:{top:r.top,bottom:r.bottom,left:r.left,width:r.width,opacity:Number(style.opacity),visible:style.visibility!=="hidden"},header:document.querySelector(".archive-identity img").getBoundingClientRect().toJSON()});})));}
async function bookTop(drawing,height){const image=await sharp(Buffer.from(drawing.png.split(",")[1],"base64")).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let y=0;y<image.info.height;y++){let count=0;for(let x=0;x<image.info.width;x++)if(image.data[(y*image.info.width+x)*4+3]>240)count++;if(count>4)return y/image.info.height*height;}throw new Error("Actual WebGL drawing missing; cannot claim a visual geometry check.");}
try{const context=await browser.newContext();await context.route("**/*",route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());const page=await context.newPage();
  for(const [width,height] of [[320,568],[360,640],[375,667],[390,844],[393,852],[430,932],[393,1000],[667,375],[844,390],[1366,768],[1920,1080]]){
    await page.setViewportSize({width,height});await page.goto(base);await page.locator(".press-experience.is-ready").waitFor({timeout:120000});await page.locator(".loading-screen").waitFor({state:"hidden",timeout:120000});
    const result=await drawing(page);const top=await bookTop(result,height);const gap=top-result.hint.bottom;assert.ok(gap>=8,`${width}×${height}: hint/book gap ${gap.toFixed(1)}px`);assert.ok(result.hint.top>=0);assert.ok(Math.abs(result.hint.left+result.hint.width/2-width/2)<1);assert.deepEqual(await page.getByTestId("shelf-canvas").evaluate(node=>({width:node.clientWidth,height:node.clientHeight})),{width,height});
    const padding=width<=760?18:Math.min(56,Math.max(22,width*.034));assert.ok(Math.abs(result.header.x-padding)<1);assert.equal(result.header.y,width<=760?20:26);
    const menu=await page.getByRole("button",{name:"Open archive navigation",exact:true}).boundingBox();assert.ok(Math.abs(menu.x+menu.width-(width-padding))<1,"Header navigation placement must remain unchanged");assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    console.log(`PASS ${width}×${height}: actual opaque WebGL book top ${top.toFixed(1)}px; hint bottom ${result.hint.bottom.toFixed(1)}px; gap ${gap.toFixed(1)}px; canvas remains full viewport.`);await page.screenshot({path:output+`shelf-${width}-${height}.png`});
    // Native pointer input exercises the faster existing drag scroll as well
    // as the hint's independent, deliberately unchanged fade observer.
    await page.mouse.move(5,height*.6);await page.mouse.down();
    for(const delta of [8,16,24,32,40]){await page.mouse.move(5,height*.6-delta);const frame=await drawing(page);if(frame.hint.visible && frame.hint.opacity>.02)assert.ok(frame.hint.bottom<=await bookTop(frame,height),`${width}×${height}: hint overlaps during drag`);}
    await page.mouse.up();await page.getByTestId("shelf-canvas").dispatchEvent("wheel",{deltaY:200,deltaMode:0});await page.waitForTimeout(160);assert.ok(Number(await page.locator(".shelf-intro").evaluate(node=>getComputedStyle(node).opacity))<1,"Existing scroll fade must still work");
    if(width<=844){
      await page.locator(".shelf-index button").first().click();await page.waitForFunction(()=>window.__PRESS_LIBRARY__?.diagnostics().activeIndex===0 && window.__PRESS_LIBRARY__?.diagnostics().motionPhase==="idle");await page.waitForTimeout(400);
      const touch=await context.newCDPSession(page);await touch.send("Emulation.setTouchEmulationEnabled",{enabled:true});await touch.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:5,y:height*.6}]});
      for(const delta of [8,16,24,32,40]){await touch.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:5,y:height*.6-delta}]});const frame=await drawing(page);if(frame.hint.visible && frame.hint.opacity>.02)assert.ok(frame.hint.bottom<=await bookTop(frame,height),`${width}×${height}: hint overlaps during native Chromium touch`);}
      await touch.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await touch.send("Emulation.setTouchEmulationEnabled",{enabled:false});await touch.detach();console.log(`PASS ${width}×${height}: native Chromium touch browsing/fade, no visible hint overlap.`);
    }
  }
  await page.emulateMedia({reducedMotion:"reduce"});await page.goto(base);await page.locator(".press-experience.is-ready").waitFor({timeout:120000});const canvas=page.getByTestId("shelf-canvas");await canvas.dispatchEvent("wheel",{deltaY:70,deltaMode:0});assert.equal(await page.locator(".shelf-intro").evaluate(node=>getComputedStyle(node).opacity),"0");await canvas.dispatchEvent("wheel",{deltaY:-70,deltaMode:0});assert.equal(await page.locator(".shelf-intro").evaluate(node=>getComputedStyle(node).opacity),"1");console.log("PASS unchanged reduced-motion fade and natural return-to-top hint.");
}finally{await browser.close();}
