// Independent local contract environment, NOT a production auth/provider mode.
// Always bound to 127.0.0.1. Never deploy this script or its mutable data store.
import {createServer} from "node:http";
import {AsyncLocalStorage} from "node:async_hooks";
import {readFile,writeFile,mkdir,rename,stat,readdir} from "node:fs/promises";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {join,resolve,sep,extname} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {moduleLoader} from "../tests/helpers/load-typescript.mjs";
import {fakeDatabase,bookDatabaseDefaults} from "../tests/helpers/fake-database.mjs";

if(process.env.GSMUN_OFFLINE_VERIFY!=="1")throw new Error("Launch using npm run preview:sandbox so the external-network/credential guard is installed.");
const require=createRequire(import.meta.url);const {webpack}=require("next/dist/compiled/webpack/webpack");
const root=fileURLToPath(new URL("../",import.meta.url));const directory=join(root,".local/release-sandbox");const filesRoot=join(directory,"objects");
await mkdir(filesRoot,{recursive:true});
const dataPath=join(directory,"content.json");const session=randomUUID();const scope=new AsyncLocalStorage();
const fake=fakeDatabase();globalThis.__cmsOffline=fake;
Object.defineProperty(fake.state,"role",{get:()=>scope.getStore()?.role ?? "anonymous",set:value=>{const current=scope.getStore();if(current)current.role=value;}});
const manifest=JSON.parse(await readFile(join(root,".local/catalog-import-v1-no-demo/manifest.json"),"utf8"));
const uploadManifest=JSON.parse(await readFile(join(root,".local/catalog-import-v1-no-demo/storage-upload-manifest.json"),"utf8"));
const artwork=new Map();
for(const entry of uploadManifest.objects){
  const path=resolve(root,entry.source);
  if(!path.startsWith(join(root,"public","books")+sep))throw new Error("Unexpected artwork path in local review bundle.");
  const bytes=await readFile(path);
  if(createHash("sha256").update(bytes).digest("hex")!==entry.sha256)throw new Error("Artwork checksum mismatch; sandbox stopped.");
  artwork.set(entry.storage_key,path);
}
try{const saved=JSON.parse(await readFile(dataPath,"utf8"));for(const table of Object.keys(fake.tables)){if(saved[table]===undefined && (table==="archive_navigation" || table.startsWith("drive_"))){fake.tables[table]=[];continue;}if(!Array.isArray(saved[table]))throw new Error("Invalid saved local store");fake.tables[table]=saved[table];}}
catch(error){if(error.code!=="ENOENT")throw error;for(const table of Object.keys(fake.tables))fake.tables[table]=structuredClone(manifest.data[table] ?? []);}
// Older simulated records omitted DB-generated material/text defaults. Mirror
// the installed SQL defaults for local fixtures only, without touching the app.
fake.tables.books=fake.tables.books.map(bookDatabaseDefaults);
let writes=Promise.resolve();
function save(){writes=writes.then(async()=>{const temporary=join(directory,`content-${randomUUID()}.tmp`);await writeFile(temporary,JSON.stringify(fake.tables,null,2));await rename(temporary,dataPath);});return writes;}
await save();
function objectPath(key){const path=resolve(filesRoot,key);if(!key.startsWith("books/") || !path.startsWith(filesRoot+sep) || key.includes(".."))throw new Error("Invalid local object key");return path;}
fake.db.storage.from=()=>({
  upload:async(key,bytes)=>{try{const path=objectPath(key);await mkdir(resolve(path,".."),{recursive:true});await writeFile(path,bytes,{flag:"wx"});return {error:null};}catch(error){return {error:{statusCode:error.code==="EEXIST"?"409":"503",message:error.code==="EEXIST"?"already exists":"Local transfer failed"}};}},
  download:async key=>{try{return {data:new Blob([await readFile(artwork.get(key) ?? objectPath(key))]),error:null};}catch{return {data:null,error:{message:"Local image missing"}};}},
});
await new Promise((done,fail)=>webpack({mode:"production",context:root,entry:"./tests/fixtures/release-sandbox-entry.tsx",output:{path:directory,filename:"sandbox.js"},optimization:{minimize:false},resolve:{extensions:[".tsx",".ts",".js"],alias:{"next/link$":fileURLToPath(new URL("../tests/fixtures/browser-link.tsx",import.meta.url))}},module:{rules:[{test:/\.(?:tsx?|css)$/,exclude:/node_modules/,use:[{loader:fileURLToPath(new URL("../tests/helpers/browser-loader.cjs",import.meta.url))}]}]},performance:false},(error,stats)=>error||stats?.hasErrors()?fail(error ?? new Error(stats.toString({all:false,errors:true}))):done()));
const load=moduleLoader({"server-only":"export {};","next/server":"export class NextResponse extends Response { static json(value,init){return Response.json(value,init);} static redirect(url){return Response.redirect(url);} }","@supabase/ssr":"export const createServerClient=()=>globalThis.__cmsOffline.db;","@supabase/supabase-js":"export const createClient=()=>globalThis.__cmsOffline.db;","next/headers":"export const cookies=async()=>({getAll:()=>[],set:()=>{}});",[new URL("../lib/supabase/config",import.meta.url).href]:"export const supabaseConfig=()=>({url:'http://127.0.0.1:9',key:'offline-only'});"});
const content=await load("app/api/admin/content/route.ts");const upload=await load("app/api/admin/upload/route.ts");const assets=await load("app/api/assets/[id]/route.ts");
const logout=await load("app/api/auth/logout/route.ts");const privateGallery=await load("app/api/admin/gallery/route.ts");const search=await load("app/api/content/search/route.ts");
const backup=await load("app/api/admin/export/route.ts");
const navigation=await load("app/api/admin/navigation/route.ts");
const drive=await load("app/api/admin/drive/route.ts");
const {publicNavigation}=await load("lib/cms/navigation-service.ts");
const {getDatabaseBook,getDatabasePublishedBooks}=await load("lib/cms/content.ts");const {publicGalleryPage}=await load("lib/cms/public-gallery.ts");
const cssRoot=join(root,".local/offline-next/static");let css=[];
try{css=(await readdir(join(cssRoot,"chunks"))).filter(file=>file.endsWith(".css")).map(file=>`/_next/static/chunks/${file}`);}catch{throw new Error("Run npm test first to produce the isolated Next build/CSS. No production credentials are required.");}
const types={".css":"text/css",".js":"text/javascript",".webp":"image/webp",".png":"image/png",".jpg":"image/jpeg",".woff2":"font/woff2",".woff":"font/woff",".ttf":"font/ttf"};
async function sendFile(outgoing,base,path){const full=resolve(base,path);if(!full.startsWith(resolve(base)+sep))throw new Error("Invalid file path");const info=await stat(full);if(!info.isFile())throw new Error("Not a file");outgoing.writeHead(200,{"Content-Type":types[extname(full)] ?? "application/octet-stream"});outgoing.end(await readFile(full));}
const app=createServer(async(incoming,outgoing)=>{
  const origin=`http://127.0.0.1:${app.address().port}`;
  if(incoming.headers.host!==new URL(origin).host){outgoing.writeHead(403);outgoing.end("Loopback sandbox only");return;}
  const url=new URL(incoming.url,origin);const authenticated=(incoming.headers.cookie ?? "").split(";").some(cookie=>cookie.trim()===`gsmun-sandbox=${session}`);
  await scope.run({role:authenticated?"admin":"anonymous"},async()=>{
    try{
      if(url.pathname==="/sandbox.js"){await sendFile(outgoing,directory,"sandbox.js");return;}
      if(url.pathname.startsWith("/_next/static/")){await sendFile(outgoing,cssRoot,url.pathname.slice("/_next/static/".length));return;}
      if(["/books/","/archive/","/fonts/","/environment/","/identity/"].some(prefix=>url.pathname.startsWith(prefix))){await sendFile(outgoing,join(root,"public"),decodeURIComponent(url.pathname.slice(1)));return;}
      if(!url.pathname.startsWith("/api/")){
        if(url.pathname.startsWith("/admin/") && !url.pathname.startsWith("/admin/login") && !authenticated){outgoing.writeHead(302,{Location:"/admin/login/"});outgoing.end();return;}
        outgoing.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});outgoing.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GSMUN — LOCAL SIMULATION</title>${css.map(path=>`<link rel="stylesheet" href="${path}">`).join("")}<style>.sandbox-notice{position:fixed;top:0;left:0;right:0;z-index:10000;height:28px;padding:5px 10px;white-space:nowrap;overflow:auto;background:#ffa800;color:#10281c;font:12px system-ui}.sandbox-notice a{color:inherit;text-decoration:underline}.sandbox-empty{padding:100px 24px;min-height:100dvh;background:#09291f;color:#fff;font:16px system-ui}</style></head><body><div id="root"></div><script src="/sandbox.js"></script></body></html>`);return;
      }
      const chunks=[];let length=0;for await(const chunk of incoming){length+=chunk.length;if(length>32*1024*1024){outgoing.writeHead(413);outgoing.end("File too large");return;}chunks.push(chunk);}
      const request=new Request(url,{method:incoming.method,headers:incoming.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});let response;
      const path=url.pathname.replace(/\/$/,"");
      if(path==="/api/sandbox/session" && incoming.method==="POST"){
        if(incoming.headers.origin!==origin)response=new Response("Origin rejected",{status:403});
        else response=Response.json({ok:true},{headers:{"Set-Cookie":`gsmun-sandbox=${session}; Path=/; HttpOnly; SameSite=Strict`}});
      }else if(path==="/api/sandbox/books")response=Response.json(await getDatabasePublishedBooks());
      else if(path==="/api/sandbox/navigation")response=Response.json(await scope.run({role:"anonymous"},()=>publicNavigation(fake.db)));
      else if(path==="/api/sandbox/preview-books")response=authenticated?Response.json((await Promise.all([...fake.tables.books].sort((a,b)=>a.sort_order-b.sort_order).map(book=>getDatabaseBook(book.id,fake.db,true)))).filter(Boolean)):new Response("Local admin required",{status:401});
      else if(path==="/api/sandbox/preview")response=authenticated?Response.json(await getDatabaseBook(url.searchParams.get("id"),fake.db,true)):new Response("Local admin required",{status:401});
      else if(path.startsWith("/api/assets/"))response=await assets.GET(request,{params:Promise.resolve({id:path.split("/")[3]})});
      else if(path.startsWith("/api/content/books/")){
        const id=path.split("/")[4];const value=path.endsWith("/photos")?await publicGalleryPage(fake.db,id,Object.fromEntries(url.searchParams)):await getDatabaseBook(id,fake.db);
        response=value?Response.json(value):new Response("Not published",{status:404});
      }else{
        const route=({"/api/admin/content":content,"/api/admin/upload":upload,"/api/admin/gallery":privateGallery,"/api/admin/export":backup,"/api/admin/navigation":navigation,"/api/admin/drive":drive,"/api/content/search":search,"/api/auth/logout":logout})[path];
        response=route?.[incoming.method]?await route[incoming.method](request):new Response("Not found",{status:404});
        if(path==="/api/auth/logout" && response.ok)response.headers.set("Set-Cookie","gsmun-sandbox=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
      }
      if(incoming.method!=="GET" && incoming.method!=="HEAD")await save();
      outgoing.writeHead(response.status,Object.fromEntries(response.headers));
      if(response.body){for await(const chunk of response.body)outgoing.write(Buffer.from(chunk));}outgoing.end();
    }catch{if(!outgoing.headersSent)outgoing.writeHead(503,{"Content-Type":"application/json"});outgoing.end(JSON.stringify({error:"Local sandbox operation failed. Saved data is retained."}));}
  });
});
const port=Number(process.env.GSMUN_SANDBOX_PORT ?? 5210);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("Invalid local sandbox port");
app.listen(port,"127.0.0.1",()=>console.log(`LOCAL SIMULATION ONLY: http://127.0.0.1:${port}/ · Admin http://127.0.0.1:${port}/admin/ · files/metadata persist under .local/release-sandbox. No live login, database or storage is involved.`));
