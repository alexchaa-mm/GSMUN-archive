import "server-only";
import {readFile,writeFile,mkdir,readdir,stat,rename,unlink,utimes} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {resolve,join,sep} from "node:path";

const pending=new Map<string,Promise<Buffer>>();
/** Private server cache for immutable derived objects, NOT authorization cache.
 * The asset route must authorize every request BEFORE reaching this function.
 * Never expose the cache directory through a static/public server. */
export async function cachedVariant(key:string,load:()=>Promise<Buffer>):Promise<Buffer|null>{
  const configured=process.env.GSMUN_MEDIA_CACHE_DIR;
  if(!configured || !/\/(thumbnail|viewer)\.webp$/.test(key))return null;
  const directory=resolve(configured);const publicDirectory=resolve(process.cwd(),"public");
  if(directory===publicDirectory || directory.startsWith(publicDirectory+sep))throw new Error("Private media cache must not be inside public files.");
  const filename=createHash("sha256").update(key).digest("hex")+".image";const path=join(directory,filename);
  try{const bytes=await readFile(path);void utimes(path,new Date(),new Date()).catch(()=>{});return bytes;}catch{/* Cache miss, never a reason to bypass authorization. */}
  if(pending.has(path))return pending.get(path)!;
  const transfer=(async()=>{
    const bytes=await load();const cap=Number(process.env.GSMUN_MEDIA_CACHE_GB ?? "8")*1e9;
    if(!Number.isFinite(cap) || cap<=0 || bytes.length>16*1024*1024)return bytes;
    try{
      await mkdir(directory,{recursive:true,mode:0o700});
      const entries=await readdir(directory);
      const files=(await Promise.all(entries.filter(name=>/^[a-f0-9]{64}\.image$/.test(name)).map(async name=>{const info=await stat(join(directory,name));return {name,size:info.size,time:info.mtimeMs};}))).sort((a,b)=>a.time-b.time);
      let used=files.reduce((sum,file)=>sum+file.size,0);
      for(const file of files){if(used+bytes.length<=cap)break;await unlink(join(directory,file.name));used-=file.size;}
      if(bytes.length<=cap){const temporary=join(directory,`${filename}.${randomUUID()}.tmp`);await writeFile(temporary,bytes,{flag:"wx",mode:0o600});await rename(temporary,path);}
    }catch{/* Full/readonly cache: serve authorized bytes without claiming persistence. */}
    return bytes;
  })();
  pending.set(path,transfer);try{return await transfer;}finally{pending.delete(path);}
}
