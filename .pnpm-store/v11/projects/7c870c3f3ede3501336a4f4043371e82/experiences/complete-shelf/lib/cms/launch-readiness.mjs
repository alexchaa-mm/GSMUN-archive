import {r2ConnectionConfig} from "./storage-config.mjs";
/** Configuration checks only. No network calls and no environment values in output. */
export function inspectLaunchConfig(env=process.env,expectedProject="lofuwoctrqjnnovbggxj"){
  const checks=[];
  const check=(id,ok,message)=>checks.push({id,ok:!!ok,message});
  let projectMatches=false;try{projectMatches=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname===`${expectedProject}.supabase.co`;}catch{/* Report names/status, never the supplied value. */}
  check("supabase-project",projectMatches,"Supabase URL must match the explicitly approved project.");
  check("supabase-key",!!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_secret_"),"Use the existing publishable/anon key; live admin authorization must still be tested.");
  const timeout=Number(env.GSMUN_DATABASE_TIMEOUT_MS || "60000");check("database-timeout",Number.isInteger(timeout) && timeout>=1000 && timeout<=180000,"GSMUN_DATABASE_TIMEOUT_MS must be 1000–180000 milliseconds; default 60000.");
  check("database-source",env.GSMUN_CONTENT_SOURCE!=="local","Production must use database content, not the read-only local catalogue.");
  check("not-simulation",env.GSMUN_OFFLINE_VERIFY!=="1","The guarded offline preview is not a deployable cloud configuration.");
  check("r2-default",env.GSMUN_OBJECT_STORAGE==="r2","New photos must use the approved private R2 bucket for this release plan.");
  try{const config=r2ConnectionConfig(env);check("r2-config",true,"R2 configuration shape is valid; bucket connectivity/privacy is NOT verified.");check("r2-proxy",config.delivery==="proxy","Use proxy delivery for publication checks on every image request.");}catch(error){check("r2-config",false,error instanceof Error?error.message:"R2 configuration is invalid.");}
  let origin=false;try{const url=new URL(env.GSMUN_PUBLIC_ORIGIN);origin=url.protocol==="https:" && !url.username && !url.password && url.pathname==="/" && !url.search && !url.hash;}catch{/* Unset origin. */}
  check("https-origin",origin,"Configure the exact HTTPS origin and verify reverse-proxy/cookie behavior.");
  check("storage-budget",Number.isFinite(Number(env.GSMUN_STORAGE_LIMIT_GB ?? "35")) && Number(env.GSMUN_STORAGE_LIMIT_GB ?? "35")>0,"Set an explicit storage admission budget; it is not a provider spending cap.");
  const driveConfigured=env.GSMUN_DRIVE_ENABLED==="1" && !!env.GSMUN_DRIVE_KEY_FILE && /^[a-zA-Z0-9_-]{1,200}$/.test(env.GSMUN_DRIVE_ROOT_FOLDER_ID ?? "");
  return {configurationOnly:true,ready:checks.every(item=>item.ok),checks,drive:{configured:driveConfigured,optionalForManualUploadLaunch:true},externalServicesVerified:false};
}
