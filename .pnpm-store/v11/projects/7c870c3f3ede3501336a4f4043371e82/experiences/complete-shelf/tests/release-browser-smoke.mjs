// Real React/UI + real handlers, persisted LOOPBACK SIMULATION only.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile,mkdir} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
const require=createRequire(import.meta.url);const {chromium}=require(process.env.GSMUN_PLAYWRIGHT_MODULE ?? "playwright");
const base=process.env.GSMUN_SANDBOX_URL ?? "http://127.0.0.1:5210";
if(new URL(base).hostname!=="127.0.0.1")throw new Error("Release smoke must run on the isolated loopback sandbox");
const browser=await chromium.launch({executablePath:process.env.GSMUN_CHROME_PATH,headless:true,args:["--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--disable-background-networking"]});
const errors=[];const output=fileURLToPath(new URL("../.local/release-browser/",import.meta.url));await mkdir(output,{recursive:true});
let cleanupBook;let cleanupNavigation;let adminContext;
try{
  const admin=await browser.newContext({viewport:{width:1440,height:900}});await admin.route("**/*",route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  adminContext=admin;
  const page=await admin.newPage();page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
  await page.goto(base+"/admin/");await page.getByRole("button",{name:"Enter simulated administrator",exact:true}).click();await page.waitForURL("**/admin/");
  const title="LOCAL RELEASE QA "+Date.now();
  await page.getByRole("button",{name:"Create book",exact:true}).click();await page.getByLabel("Book title",{exact:true}).fill(title);await page.getByLabel("Short title",{exact:true}).fill("QA");await page.getByLabel("URL slug",{exact:true}).fill("local-qa-"+Date.now());await page.getByLabel("Full committee / subtitle").fill("LOCAL QA committee");await page.getByLabel("Description",{exact:true}).fill("Local simulated test content only — never conference photography.");await page.getByRole("button",{name:"Create draft book",exact:true}).click();await page.getByRole("heading",{name:`Edit ${title}`,exact:true}).waitFor();
  for(const [i,name]of ["ARRIVAL","DEBATE","PEOPLE"].entries()){await page.getByRole("button",{name:"Add section",exact:true}).click();await page.getByLabel("Title",{exact:true}).fill(name);await page.getByLabel("Slug",{exact:true}).fill(name.toLowerCase());await page.getByLabel("Order",{exact:true}).last().fill(String((i+1)*10));await page.getByRole("button",{name:"Save chapter",exact:true}).click();await page.getByRole("heading",{name:`Photographs · ${title} → ${name}`,exact:true}).waitFor();}
  const chosenBook=(await (await admin.request.get(base+"/api/admin/content?entity=books")).json()).data.find(book=>book.title===title);
  cleanupBook=chosenBook.id;
  const chosenArchive=(await (await admin.request.get(base+`/api/admin/content?entity=archives&parent=${chosenBook.id}`)).json()).data[0];
  const chosenChapter=(await (await admin.request.get(base+`/api/admin/content?entity=sections&parent=${chosenArchive.id}`)).json()).data.find(section=>section.title==="PEOPLE");
  await page.getByRole("button",{name:"Conference photos",exact:true}).click();await page.getByLabel("Select book",{exact:true}).selectOption(chosenBook.id);await page.getByLabel("Select chapter",{exact:true}).selectOption(chosenChapter.id);
  await page.getByText(`Upload destination: ${title} → PEOPLE`,{exact:true}).waitFor();
  const panel=page.getByRole("heading",{name:`Photographs · ${title} → PEOPLE`,exact:true}).locator("..");
  const png=await sharp(Buffer.from('<svg width="900" height="600"><rect width="900" height="600" fill="#154b32"/><text x="36" y="280" font-size="28" fill="#ffa800">LOCAL QA — NOT CONFERENCE PHOTOGRAPHY</text></svg>')).png().toBuffer();
  const portrait=await sharp({create:{width:600,height:900,channels:3,background:"#32461c"}}).png().toBuffer();
  let first=true;await page.route("**/api/admin/upload",route=>{if(first){first=false;return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Simulated connection interruption. Retry the same upload ID."})});}return route.continue();});
  await panel.locator('input[type="file"][multiple]').setInputFiles([{name:"local-qa-one.png",mimeType:"image/png",buffer:png},{name:"local-qa-two.png",mimeType:"image/png",buffer:portrait},{name:"invalid.heic",mimeType:"image/heic",buffer:Buffer.from("invalid")}]);
  await page.waitForFunction(()=>document.body.textContent.includes("1 saved · 0 pending · 2 need attention"));await panel.getByRole("button",{name:"Retry failed files",exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes("2 saved · 0 pending · 1 need attention"));
  await panel.getByLabel("Caption (optional)",{exact:true}).first().fill("LOCAL RELEASE searchable caption");await panel.getByRole("button",{name:"Save photo details",exact:true}).first().click();await page.getByText("Server confirmed the operation. Lists have been refreshed.").waitFor();
  await panel.getByLabel("Download filename",{exact:true}).first().fill("GSMUN local QA original.png");await panel.getByRole("button",{name:"Save filename",exact:true}).first().click();
  const books=await (await admin.request.get(base+"/api/admin/content?entity=books")).json();const book=books.data.find(book=>book.title===title);assert.ok(book);
  const archives=await (await admin.request.get(base+`/api/admin/content?entity=archives&parent=${book.id}`)).json();const archive=archives.data[0];
  const sections=(await (await admin.request.get(base+`/api/admin/content?entity=sections&parent=${archive.id}`)).json()).data;assert.equal(sections.length,3);const people=sections.find(section=>section.title==="PEOPLE");
  const photographs=(await (await admin.request.get(base+`/api/admin/content?entity=photos&parent=${people.id}`)).json()).data;assert.equal(photographs.length,2);assert.ok(photographs.every(photo=>photo.status==="draft"));
  async function change(action){const response=await admin.request.post(base+"/api/admin/content",{headers:{origin:base},data:action});assert.equal(response.status(),200,await response.text());}
  await change({action:"move",entity:"sections",id:people.id,beforeId:sections[0].id});
  const anonymous=await browser.newContext({viewport:{width:390,height:844}});await anonymous.route("**/*",route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  assert.equal((await anonymous.request.get(base+`/api/assets/${photographs[0].asset_id}`)).status(),404);assert.equal((await anonymous.request.post(base+"/api/admin/content",{headers:{origin:base},data:{action:"book-status",id:book.id,status:"published"}})).status(),401);
  for(const section of sections)await change({action:"item-status",entity:"sections",id:section.id,status:"published"});
  await change({action:"book-status",id:book.id,status:"published"});
  const empty=await (await anonymous.request.get(base+`/api/content/books/${book.id}`)).json();assert.equal(empty.sections.flatMap(section=>section.photos).length,0,"Publishing a parent must not publish photos");
  for(const photo of photographs)await change({action:"item-status",entity:"photos",id:photo.id,status:"published"});
  const originalNavigation=await (await admin.request.get(base+"/api/admin/navigation")).json();cleanupNavigation=originalNavigation.publishedConfig;const config=structuredClone(originalNavigation.publishedConfig);config.groups.push({id:`qa-${book.id}`,title:"LOCAL QA destinations",visible:true,order:5,entries:[{id:`focus-${book.id}`,label:"Focus test volume",visible:true,order:10,bookId:book.id,behavior:"focus"},{id:`chapter-${book.id}`,label:"Open test chapter",visible:true,order:20,bookId:book.id,chapterId:people.id,behavior:"open"}]});
  const navigationPublished=await admin.request.post(base+"/api/admin/navigation",{headers:{origin:base},data:{action:"publish",config,version:originalNavigation.publishedVersion}});assert.equal(navigationPublished.status(),200,await navigationPublished.text());
  const visitor=await anonymous.newPage();visitor.on("pageerror",error=>errors.push(error.message));
  await visitor.addInitScript(()=>{Object.defineProperty(navigator,"share",{value:undefined,configurable:true});Object.defineProperty(navigator,"clipboard",{value:undefined,configurable:true});});
  await visitor.goto(base+"/");await visitor.locator(".press-experience.is-ready").waitFor();await visitor.getByRole("button",{name:"Open archive navigation",exact:true}).click();await visitor.getByRole("dialog",{name:"Archive navigation",exact:true}).getByRole("link",{name:"Focus test volume",exact:true}).click();await visitor.getByRole("dialog",{name:"Archive navigation",exact:true}).waitFor({state:"hidden"});assert.equal(await visitor.getByTestId("committee-archive").count(),0);await visitor.getByRole("button",{name:"Open archive navigation",exact:true}).click();await visitor.getByRole("dialog",{name:"Archive navigation",exact:true}).getByRole("link",{name:"Open test chapter",exact:true}).click();await visitor.getByTestId("committee-archive").waitFor();assert.ok(new URL(visitor.url()).searchParams.get("chapter")===people.id);await visitor.goBack();await visitor.locator(".press-experience.is-ready").waitFor();
  for(const [width,height]of [[390,844],[393,852],[430,932],[768,1024],[1440,900]]){
    await visitor.setViewportSize({width,height});await visitor.goto(base+`/?book=${book.id}`);await visitor.getByTestId("committee-archive").waitFor();await visitor.locator(".archive-photo").first().waitFor();assert.equal(await visitor.locator(".archive-photo").count(),2);
    const metrics=await visitor.evaluate(()=>({overflow:document.querySelector(".committee-archive").scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector(".archive-photo-grid")).gridTemplateColumns.split(" ").length}));assert.equal(metrics.overflow,false);assert.equal(metrics.columns,width<=780?2:width<1100?3:4);
    await visitor.locator(".archive-photo").first().click();await visitor.getByTestId("photo-viewer").waitFor();await visitor.getByRole("button",{name:"Zoom",exact:true}).click();assert.equal(await visitor.getByRole("button",{name:"Fit image",exact:true}).getAttribute("aria-pressed"),"true");await visitor.getByRole("button",{name:"Fit image",exact:true}).click();await visitor.keyboard.press("ArrowRight");await visitor.getByRole("button",{name:"Previous photograph",exact:true}).click();await visitor.keyboard.press("Escape");await visitor.getByTestId("photo-viewer").waitFor({state:"detached"});
    await visitor.screenshot({path:output+`gallery-${width}.png`});
  }
  await visitor.locator(".archive-photo").first().click();const downloadEvent=visitor.waitForEvent("download");await visitor.getByRole("button",{name:"Download",exact:true}).click();const download=await downloadEvent;await download.saveAs(output+"download.png");
  const saved=await readFile(output+"download.png");assert.ok([png,portrait].some(bytes=>createHash("sha256").update(bytes).digest("hex")===createHash("sha256").update(saved).digest("hex")),"Download must preserve one of the exact uploaded originals");assert.equal(download.suggestedFilename(),"GSMUN local QA original.png");
  await visitor.getByRole("button",{name:"Share",exact:true}).click();const shared=await visitor.getByLabel("Photograph link to copy").inputValue();assert.match(shared,/\?book=/);assert.match(shared,/photo=/);assert.doesNotMatch(shared,/r2|token|secret/i);
  const deep=await anonymous.newPage();await deep.goto(shared);await deep.getByTestId("photo-viewer").waitFor();await deep.getByRole("button",{name:"Close photograph",exact:true}).click();await deep.getByTestId("photo-viewer").waitFor({state:"detached"});
  await visitor.keyboard.press("Escape");assert.equal(await visitor.getByRole("link",{name:"Search all volumes",exact:true}).count(),0);assert.equal(await visitor.getByLabel("Find photographs",{exact:true}).count(),0);assert.equal(await visitor.locator(".archive-gallery-tools select").count(),0);
  await panel.getByRole("button",{name:"Move earlier",exact:true}).nth(1).click();await page.getByText("Server confirmed the operation. Lists have been refreshed.").waitFor();
  const reordered=(await (await admin.request.get(base+`/api/admin/content?entity=photos&parent=${people.id}`)).json()).data;assert.equal(reordered[0].id,photographs[1].id);
  // Cross the initial 12-photo window using real local uploads, not fixture-only UI.
  // No originals or metadata leave the loopback simulation.
  const tail=[];
  for(let index=0;index<13;index++){
    const bytes=await sharp({create:{width:64,height:64,channels:3,background:{r:20+index,g:70,b:40}}}).png().toBuffer();
    const id=randomUUID();const response=await admin.request.post(base+"/api/admin/upload",{headers:{origin:base},multipart:{uploadId:id,bookId:book.id,sectionId:people.id,kind:"photo",file:{name:`local-qa-tail-${index}.png`,mimeType:"image/png",buffer:bytes}}});
    assert.equal(response.status(),200,await response.text());const saved=await response.json();tail.push(saved.photoId);
    await change({action:"item-status",entity:"photos",id:saved.photoId,status:"published"});
  }
  await visitor.goto(base+`/?book=${book.id}`);await visitor.locator(".archive-photo").nth(11).waitFor();assert.equal(await visitor.locator(".archive-photo").count(),12);
  await visitor.getByRole("button",{name:/Load more photographs/}).click();await visitor.waitForFunction(()=>document.querySelectorAll(".archive-photo").length===15);
  await deep.goto(base+`/?book=${book.id}&chapter=${people.id}&photo=${tail[10]}`);await deep.getByTestId("photo-viewer").waitFor();
  const mainImage=deep.locator(".photo-viewer__stage > img");assert.ok((await mainImage.getAttribute("src")).includes(tail[10]));
  await deep.getByRole("button",{name:"Next photograph",exact:true}).click();await deep.waitForFunction(id=>document.querySelector(".photo-viewer__stage > img")?.getAttribute("src")?.includes(id),tail[11]);
  await deep.getByRole("button",{name:"Previous photograph",exact:true}).click();await deep.waitForFunction(id=>document.querySelector(".photo-viewer__stage > img")?.getAttribute("src")?.includes(id),tail[10]);
  await deep.getByRole("button",{name:"Close photograph",exact:true}).click();
  await change({action:"item-status",entity:"photos",id:photographs[0].id,status:"draft"});assert.equal((await anonymous.request.get(base+`/api/assets/${photographs[0].asset_id}`)).status(),404);
  await change({action:"book-status",id:book.id,status:"draft"});assert.equal((await anonymous.request.get(base+`/api/content/books/${book.id}`)).status(),404);
  const publicMenu=await (await anonymous.request.get(base+"/api/sandbox/navigation")).json();assert.ok(!publicMenu.groups.some(group=>group.entries.some(entry=>entry.bookId===book.id)),"Withdrawn targets must disappear from navigation");
  const restoreNavigation=await admin.request.post(base+"/api/admin/navigation",{headers:{origin:base},data:{action:"publish",config:originalNavigation.publishedConfig,version:(await navigationPublished.json()).version}});assert.equal(restoreNavigation.status(),200,await restoreNavigation.text());cleanupNavigation=undefined;
  const retained=(await (await admin.request.get(base+`/api/admin/content?entity=books&id=${book.id}`)).json()).data[0];assert.equal(retained.status,"draft");
  assert.deepEqual(errors,[]);console.log(`PASS persisted LOOPBACK SIMULATION: ${book.id}; create three chapters, reorder, multi-upload/interruption/retry, caption/filename, explicit publication, drawer focus/direct chapter/browser back, original hash/download, share/deep link, zoom/keyboard/close, 5 responsive sizes, simplified gallery, withdrawal/nav filtering and unauthorized access. Test content retained as drafts only.`);
}finally{
  // Even a failing UI assertion must not leave synthetic QA content published.
  if(adminContext && cleanupBook){
    const draft=async data=>{const response=await adminContext.request.post(base+"/api/admin/content",{headers:{origin:base},data});assert.equal(response.status(),200);};
    // Scope is exclusively the synthetic book created by THIS run. Withdraw
    // the parent first, then explicitly restore its individual QA descendants
    // to drafts too; this is not an application cascade or storage cleanup.
    await draft({action:"book-status",id:cleanupBook,status:"draft"});
    const archives=(await (await adminContext.request.get(base+`/api/admin/content?entity=archives&parent=${cleanupBook}`)).json()).data;
    for(const archive of archives){const chapters=(await (await adminContext.request.get(base+`/api/admin/content?entity=sections&parent=${archive.id}`)).json()).data;for(const chapter of chapters){for(let offset=0;;offset+=48){const photos=(await (await adminContext.request.get(base+`/api/admin/content?entity=photos&parent=${chapter.id}&offset=${offset}`)).json()).data;for(const photo of photos)await draft({action:"item-status",entity:"photos",id:photo.id,status:"draft"});if(photos.length<48)break;}await draft({action:"item-status",entity:"sections",id:chapter.id,status:"draft"});}}
  }
  if(adminContext && cleanupNavigation){const current=await (await adminContext.request.get(base+"/api/admin/navigation")).json();const response=await adminContext.request.post(base+"/api/admin/navigation",{headers:{origin:base},data:{action:"publish",config:cleanupNavigation,version:current.publishedVersion}});assert.equal(response.status(),200);}
  await browser.close();
}
