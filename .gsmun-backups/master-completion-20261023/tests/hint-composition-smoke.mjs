import {createRequire} from "node:module";
import {mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
const require=createRequire(import.meta.url);const {chromium}=require(process.env.GSMUN_PLAYWRIGHT_MODULE ?? "playwright");
const base=process.env.GSMUN_TEST_URL || "http://127.0.0.1:5211/";if(new URL(base).hostname!=="127.0.0.1")throw new Error("Offline loopback preview only.");
const browser=await chromium.launch({executablePath:process.env.GSMUN_CHROME_PATH,headless:true,args:["--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--disable-background-networking"]});
const output=fileURLToPath(new URL("../.local/hint-composition/",import.meta.url));await mkdir(output,{recursive:true});
try{const context=await browser.newContext();await context.route("**/*",route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());const page=await context.newPage();
  for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[393,1000],[844,390],[1366,768],[1920,1080]]){
    await page.setViewportSize({width,height});await page.goto(base);await page.locator(".press-experience.is-ready").waitFor({timeout:120000});await page.locator(".loading-screen").waitFor({state:"hidden",timeout:120000});
    const result=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{const canvas=document.querySelector("canvas");const hint=document.querySelector(".shelf-intro");const r=hint.getBoundingClientRect();resolve({png:canvas.toDataURL(),hint:{top:r.top,bottom:r.bottom,left:r.left,width:r.width},header:document.querySelector(".archive-identity img").getBoundingClientRect().toJSON()});})));
    const image=await sharp(Buffer.from(result.png.split(",")[1],"base64")).ensureAlpha().raw().toBuffer({resolveWithObject:true});let first=-1;
    for(let y=0;y<image.info.height && first<0;y++){let count=0;for(let x=0;x<image.info.width;x++)if(image.data[(y*image.info.width+x)*4+3]>240)count++;if(count>4)first=y;}
    console.log(JSON.stringify({viewport:`${width}x${height}`,bookTop:first<0?null:first/image.info.height*height,hint:result.hint,identity:result.header}));await page.screenshot({path:output+`shelf-${width}-${height}.png`});
  }
}finally{await browser.close();}
