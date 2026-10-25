import "server-only";
import {readFile,writeFile,rename,mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import {createHash,timingSafeEqual,randomUUID} from "node:crypto";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {supabaseConfig} from "../supabase/config";
import {privateServerPath,driveSettings} from "./drive-client";
import {CmsError} from "./errors";
type Delegation={nonce:string;userId:string;refreshToken:string;disabled?:boolean};
// The supported deployment is one Node process. Share this lock even across
// independently bundled routes so disable/re-authorize cannot be overwritten
// by a refresh that began using an older delegation.
async function sessionWrite<T>(task:()=>Promise<T>){const shared=globalThis as typeof globalThis & {__gsmunDriveSessionWrite?:Promise<void>};const previous=shared.__gsmunDriveSessionWrite ?? Promise.resolve();let release!:()=>void;shared.__gsmunDriveSessionWrite=new Promise<void>(resolve=>{release=resolve;});await previous;try{return await task();}finally{release();}}
function sessionPath(){const value=process.env.GSMUN_DRIVE_WORKER_SESSION_FILE;if(!value)throw new CmsError("A private worker-session file must be configured before unattended imports can be authorized.",503);return privateServerPath(value);}
async function loadDelegation():Promise<Delegation|null>{try{const bytes=await readFile(sessionPath());if(bytes.length>32768)return null;const value=JSON.parse(bytes.toString());return !value.disabled && typeof value.nonce==="string" && value.nonce.length>0 && typeof value.refreshToken==="string" && value.refreshToken.length>0 && typeof value.userId==="string" && value.userId.length>0 ? value : null;}catch{return null;}}
async function savePrivate(value:unknown){const path=sessionPath();await mkdir(dirname(path),{recursive:true,mode:0o700});const temporary=`${path}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:"wx"});await rename(temporary,path);}
type RunStatus={lastRunAt?:string;lastSuccessAt?:string;lastError?:string};
async function lastRun():Promise<RunStatus>{try{const value=JSON.parse(await readFile(sessionPath()+".status.json","utf8"));return {lastRunAt:value.lastRunAt,lastSuccessAt:value.lastSuccessAt,lastError:value.lastError};}catch{return {};}}
async function reportRun(value:RunStatus){try{const path=sessionPath()+".status.json";const temporary=path+"."+randomUUID()+".tmp";await writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:"wx"});await rename(temporary,path);}catch{/* Next status refresh still shows authorization and existing tracked jobs. */}}
export async function workerStatus(){return {configured:!!process.env.GSMUN_DRIVE_WORKER_SESSION_FILE && !!process.env.GSMUN_DRIVE_WORKER_SECRET_FILE,authorized:!!await loadDelegation(),...await lastRun()};}
export async function authorizeWorker(db:SupabaseClient,userId:string){
  if(!driveSettings().configured)throw new CmsError("Configure the approved Drive source before authorizing unattended imports.",503);
  sessionPath();await workerSecret();const session=await db.auth.getSession();if(session.error || !session.data.session?.refresh_token)throw new CmsError("Sign in again before authorizing a worker session.",401);
  // The caller already verified getUser() and administrator membership. The
  // refresh credential is private server state, never a JSON/API response.
  await sessionWrite(()=>savePrivate({nonce:randomUUID(),userId,refreshToken:session.data.session!.refresh_token}));return {ok:true};
}
export async function disableWorker(){await sessionWrite(()=>savePrivate({disabled:true}));return {ok:true};}
async function workerSecret(){const path=process.env.GSMUN_DRIVE_WORKER_SECRET_FILE;if(!path)throw new CmsError("Private worker authorization is not configured.",503);const secret=(await readFile(privateServerPath(path),"utf8")).trim();if(secret.length<32 || secret.length>256)throw new CmsError("Use a private random worker secret of at least 32 characters.",503);return secret;}
export async function verifyWorkerRequest(request:Request){
  const expected=await workerSecret();const received=(request.headers.get("authorization") ?? "").replace(/^Bearer /,"");
  if(!timingSafeEqual(createHash("sha256").update(expected).digest(),createHash("sha256").update(received).digest()))throw new CmsError("Worker authorization required.",401);
}
export async function workerDatabase(){
  const delegation=await loadDelegation();const config=supabaseConfig();if(!delegation || !config)throw new CmsError("Unattended imports are not authorized. The existing administrator must authorize a private worker session.",401);
  const db=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,cache:"no-store"})}});
  const refresh=await db.auth.refreshSession({refresh_token:delegation.refreshToken});
  if(refresh.error || !refresh.data.session)throw new CmsError("Worker session expired or was revoked. Reauthorize using the existing administrator account.",401);
  const identity=await db.auth.getUser();if(identity.error || identity.data.user?.id!==delegation.userId)throw new CmsError("Worker identity could not be verified.",403);
  const member=await db.rpc("is_archive_admin");if(member.error || member.data!==true)throw new CmsError("Worker administrator membership could not be verified.",403);
  await sessionWrite(async()=>{const current=await loadDelegation();if(current?.nonce!==delegation.nonce)throw new CmsError("Worker authorization changed. Retry after the current operation completes.",409);await savePrivate({...delegation,refreshToken:refresh.data.session!.refresh_token});});return db;
}
let started=false;let active=false;
export function startDrivePoller(){
  if(started || process.env.GSMUN_OFFLINE_VERIFY==="1" || !driveSettings().configured || !process.env.GSMUN_DRIVE_WORKER_SESSION_FILE || !process.env.GSMUN_DRIVE_WORKER_SECRET_FILE)return;
  started=true;
  const tick=async()=>{if(active || !(await workerStatus()).authorized)return;active=true;const previous=await lastRun();const lastRunAt=new Date().toISOString();try{const secret=await workerSecret();const response=await fetch(`http://127.0.0.1:${Number(process.env.PORT)||3000}/api/internal/drive-sync/`,{method:"POST",headers:{Authorization:`Bearer ${secret}`},redirect:"error",signal:AbortSignal.timeout(240000)});await response.body?.cancel();await reportRun({lastRunAt,lastSuccessAt:response.ok?lastRunAt:previous.lastSuccessAt,lastError:response.ok?"":response.status===401||response.status===403?"Worker authorization expired or was revoked. Sign in and reauthorize.":response.status===409?"Another import tick is active; retrying next minute.":"Worker could not complete a sync. Check source access, configuration and tracked job errors."});}catch{await reportRun({lastRunAt,lastSuccessAt:previous.lastSuccessAt,lastError:"Worker request failed. Check the private worker secret, server availability and configuration."});}finally{active=false;}};
  setInterval(()=>void tick(),60000).unref();
}
