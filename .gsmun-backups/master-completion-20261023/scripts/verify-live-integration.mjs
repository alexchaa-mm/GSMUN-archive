// NO NETWORK by default. See docs/LAUNCH-READINESS.md before authorizing execution.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {createInterface} from "node:readline/promises";
import {isAbsolute} from "node:path";
import {pathToFileURL} from "node:url";
import {livePlanSchema,liveVerificationSteps} from "./live-verification-plan.mjs";
const args=process.argv.slice(2);
if(!args.includes("--execute")){
  console.log("PLAN ONLY — no requests, accounts, uploads, publication or database access.");
  liveVerificationSteps.forEach((step,index)=>console.log(`${index+1}. ${step}`));
  console.log("Execution requires an owner-approved private JSON file: --execute --approval-file ABSOLUTE_PATH. No passwords/keys belong in that file.");
}else{
  if(args.length!==3 || args[0]!=="--execute" || args[1]!=="--approval-file" || !isAbsolute(args[2]))throw new Error("Use --execute --approval-file ABSOLUTE_PRIVATE_JSON_PATH.");
  if(process.env.GSMUN_OFFLINE_VERIFY==="1")throw new Error("Live verification cannot run in a simulated/offline preview.");
  const plan=livePlanSchema.parse(JSON.parse(await readFile(args[2],"utf8")));
  if(!isAbsolute(plan.originalPath))throw new Error("The approved QA original needs an absolute local path.");
  const original=await readFile(plan.originalPath);if(!original.length || original.length>30*1024*1024)throw new Error("The approved QA original must be at most 30 MiB.");
  assert.equal(createHash("sha256").update(original).digest("hex"),plan.sha256,"Approved local QA bytes changed. Stop.");
  const {chromium}=await import(process.env.GSMUN_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.GSMUN_PLAYWRIGHT_MODULE+"/index.mjs").href : "playwright");
  const browser=await chromium.launch({headless:false,...(process.env.GSMUN_CHROME_PATH?{executablePath:process.env.GSMUN_CHROME_PATH}:{})});
  const rl=createInterface({input:process.stdin,output:process.stdout});
  const admin=await browser.newContext();const anonymous=await browser.newContext();const page=await admin.newPage();
  const origin=new URL(plan.origin).origin;let published=false;let photo;let asset;let stage="existing administrator login";const publicBook=`/api/content/books/${encodeURIComponent(plan.bookId)}/`;
  const get=async(path,visitor=false)=>{const response=await (visitor?anonymous:admin).request.get(origin+path,{maxRedirects:0,timeout:120000});assert.equal(response.status(),200,`Read failed (${response.status()}); check the admin UI, not raw provider logs.`);return response.json();};
  const post=async(path,data)=>{const response=await admin.request.post(origin+path,{headers:{origin},data,maxRedirects:0,timeout:240000});assert.equal(response.status(),200,`Operation failed (${response.status()}); review the admin UI before retrying.`);return response.json();};
  const change=data=>post("/api/admin/content/",data);
  const list=async(entity,parent,id)=>get("/api/admin/content/?"+new URLSearchParams({entity,...(parent?{parent}:{}),...(id?{id}:{}),limit:"100"}));
  async function checkOriginal(visitor=false){const response=await (visitor?anonymous:admin).request.get(origin+`/api/assets/${asset.id}/?variant=original&download=1`,{maxRedirects:0});assert.equal(response.status(),200);assert.equal(createHash("sha256").update(await response.body()).digest("hex"),plan.sha256,"Downloaded original differs from approved bytes");assert.match(response.headers()["content-disposition"] ?? "",/attachment/);}
  async function privatePhoto(){for(const variant of ["original","thumbnail","viewer"])assert.equal((await anonymous.request.get(origin+`/api/assets/${asset.id}/?variant=${variant}`,{maxRedirects:0})).status(),404,"Unpublished QA bytes must be private");}
  try{
    console.log("EXPLICIT LIVE QA: only the approved QA file/book/chapter; private Drive discovery records may also be created. No automatic deletion.");
    await page.goto(origin+"/admin/login/");await rl.question("Log in using the existing administrator in the opened browser. Do NOT enter credentials here. Press Enter after login: ");
    stage="approved configuration, schema access and worker stop checks";const readiness=await get("/api/admin/readiness/?expectedProject="+plan.expectedProject);assert.equal(readiness.ready,true,"Server configuration/schema checks failed; stop for review");assert.equal(readiness.externalServicesVerified,false);assert.equal(readiness.worker.authorized,false,"Disable unattended polling during scoped QA");assert.equal(readiness.drive.configured,true,"Drive configuration is missing");
    stage="dedicated draft QA destination checks";
    const book=(await list("books",null,plan.bookId)).data[0];assert.ok(book && book.title.startsWith("INTEGRATION TEST"),"Use a dedicated INTEGRATION TEST book, not the recovered catalogue");assert.equal(book.status,"draft");
    const archive=(await list("archives",plan.bookId)).data[0];assert.equal(archive.status,"draft");const chapters=(await list("sections",archive.id)).data;assert.ok(chapters.length>0 && chapters.length<10 && chapters.every(item=>item.status==="draft"),"All dedicated QA book chapters must be draft");const chapter=chapters.find(item=>item.id===plan.chapterId);assert.ok(chapter);assert.equal(chapter.status,"draft");
    const initialPhotos=(await list("photos",plan.chapterId)).data;assert.ok(initialPhotos.every(item=>item.status==="draft"),"QA chapter contains non-draft content");assert.ok(initialPhotos.length<10,"Use a small isolated QA chapter");
    if(plan.retryExistingFailure){const state=await get("/api/admin/drive/?fileId="+plan.driveFileId);const job=state.jobs[0];assert.ok(job && ["failed","deferred","needs_mapping"].includes(job.status),"No eligible QA failure to retry");await post("/api/admin/drive/",{action:"retry",id:job.id});}
    stage="scoped Drive import";let job;
    for(let tick=0;tick<plan.maxSyncTicks;tick++){
      await post("/api/admin/drive/",{action:"sync",fileIds:[plan.driveFileId]});const state=await get("/api/admin/drive/?fileId="+plan.driveFileId);job=state.jobs[0];console.log(`Scoped sync ${tick+1}: ${job?.status ?? "still discovering folders"}`);
      if(job?.status==="imported")break;if(job && !["queued","importing"].includes(job.status))throw new Error("QA import needs attention. Inspect its safe error in the existing Drive panel; no publication attempted.");
    }
    assert.equal(job?.status,"imported","Discovery exceeded the bounded QA ticks; resume with the same approval file");assert.equal(job.book_id,plan.bookId);assert.equal(job.section_id,plan.chapterId);
    stage="draft assignment, original integrity and private variants";photo=(await list("photos",plan.chapterId,job.photo_id)).data[0];assert.equal(photo.status,"draft");asset=(await list("assets",null,photo.asset_id)).data[0];assert.equal(asset.processing_status,"ready");assert.equal(asset.checksum,plan.sha256);assert.match(asset.storage_key,/^books\/_r2\//);await checkOriginal();await privatePhoto();
    await page.goto(origin+"/admin/");await page.getByRole("button",{name:"Conference photos",exact:true}).click();await page.getByLabel("Select book",{exact:true}).selectOption(plan.bookId);await page.getByLabel("Select chapter",{exact:true}).selectOption(plan.chapterId);await page.getByRole("heading",{name:`Photographs · ${book.title} → ${chapter.title}`,exact:true}).waitFor();await page.locator(`img[src*="/api/assets/${asset.id}"]`).waitFor();
    const {default:sharp}=await import("sharp");for(const variant of ["thumbnail","viewer"]){const response=await admin.request.get(origin+`/api/assets/${asset.id}/?variant=${variant}`);assert.equal(response.status(),200);const image=await sharp(await response.body()).metadata();assert.equal(image.format,"webp");assert.ok(Math.max(image.width,image.height)<=(variant==="thumbnail"?760:2400));}
    await post("/api/admin/drive/",{action:"sync",fileIds:[plan.driveFileId]});const repeated=(await get("/api/admin/drive/?fileId="+plan.driveFileId)).jobs;assert.equal(repeated.length,1);assert.equal(repeated[0].photo_id,photo.id);assert.equal(repeated[0].asset_id,asset.id);console.log("PASS: original integrity, variants, assignment, draft privacy and repeated-sync identity.");
    if(plan.manualUploadId){
      stage="approved manual upload fallback";
      const metadata=await sharp(original).metadata();const mime={jpeg:"image/jpeg",png:"image/png",webp:"image/webp"}[metadata.format];assert.ok(mime);
      const response=await admin.request.post(origin+"/api/admin/upload/",{headers:{origin},multipart:{file:{name:"INTEGRATION TEST manual original."+(metadata.format==="jpeg"?"jpg":metadata.format),mimeType:mime,buffer:original},kind:"photo",bookId:plan.bookId,sectionId:plan.chapterId,uploadId:plan.manualUploadId,allowDuplicate:"true"},timeout:240000});assert.equal(response.status(),200);const manual=(await list("photos",plan.chapterId,plan.manualUploadId)).data[0];assert.equal(manual.status,"draft");console.log("PASS: manual upload fallback saved a separate draft using a stable approved upload ID.");
    }
    if(plan.testPublication){
      stage="approved temporary QA publication and public viewer";
      published=true;await change({action:"book-status",id:plan.bookId,status:"published"});await change({action:"item-status",entity:"sections",id:plan.chapterId,status:"published"});assert.equal((await anonymous.request.get(origin+`/api/assets/${asset.id}/`)).status(),404,"Publishing parents must not publish photos");await change({action:"item-status",entity:"photos",id:photo.id,status:"published"});
      const visible=await get(publicBook,true);assert.ok(visible.sections.some(section=>section.id===plan.chapterId && section.photos.some(item=>item.id===photo.id)));await checkOriginal(true);await page.goto(origin+`/?book=${encodeURIComponent(book.slug)}&chapter=${plan.chapterId}&photo=${photo.id}`);await page.getByTestId("photo-viewer").waitFor();console.log("PASS: explicit QA publication, public gallery/viewer and exact original download.");
    }
    if(plan.assistedSourceRemoval){stage="owner-assisted QA source removal retention";await rl.question("Move/remove ONLY the approved QA source in Drive yourself (this script cannot modify Drive). Press Enter after doing so: ");await post("/api/admin/drive/",{action:"sync",fileIds:[plan.driveFileId]});assert.equal((await list("photos",plan.chapterId,photo.id)).data[0].asset_id,asset.id);await checkOriginal();console.log("PASS: archived bytes retained after the owner-reported QA source removal. Drive action was manual.");}
    console.log("Live QA checks completed. This is not a deployment, account-capacity or full production-security certification. Forced-outage retry still requires an approved staging failure test if none was supplied.");
  }catch{console.error(`QA STOPPED at ${stage}. Check the existing admin panel before retrying. No credentials or raw upstream error details are printed.`);process.exitCode=1;}
  finally{
    if(published){let cleanupFailed=false;for(const action of [{action:"item-status",entity:"photos",id:photo.id,status:"draft"},{action:"item-status",entity:"sections",id:plan.chapterId,status:"draft"},{action:"book-status",id:plan.bookId,status:"draft"}])try{await change(action);}catch{cleanupFailed=true;}
      try{await privatePhoto();assert.equal((await anonymous.request.get(origin+publicBook)).status(),404);}catch{cleanupFailed=true;}
      if(cleanupFailed){console.error(`URGENT: QA withdrawal was not fully confirmed. Manually withdraw QA book ${plan.bookId}, chapter ${plan.chapterId}, photo ${photo.id}.`);process.exitCode=1;}else console.log("PASS: QA photo/chapter/book withdrawn; public access denied. QA data retained as drafts, not deleted.");
    }
    rl.close();await browser.close();
  }
}
