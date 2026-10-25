import type { SupabaseClient } from "@supabase/supabase-js";
import { CmsError } from "./errors";
import { databaseError } from "./http";
const meters=new Map<string,{used:number;updated:number;loading?:Promise<void>}>();

/** Admission guard, not a provider spending cap. Retained failures/replacements
 * count too. Independent servers need an approved atomic reservation RPC before
 * this could be described as a strict account-wide cap. */
export async function checkStorageBudget(db:SupabaseClient,additionalBytes:number) {
  const gb=Number(process.env.GSMUN_STORAGE_LIMIT_GB ?? "35");
  if(!Number.isFinite(gb) || gb<=0)throw new CmsError("Invalid storage budget setting.",503);
  const project=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const meter=project ? meters.get(project) ?? {used:0,updated:0} : {used:0,updated:0};
  if(project)meters.set(project,meter);
  if(Date.now()-meter.updated>60000 && !meter.loading)meter.loading=(async()=>{
    let used=0;
    for(let offset=0;;offset+=500){
      const page=await db.from("assets").select("byte_size,variants").order("id").range(offset,offset+499);databaseError(page.error);
      for(const asset of page.data ?? []){
        used+=Number(asset.byte_size ?? 0);
        for(const variant of Object.values(asset.variants ?? {}) as {byte_size?:number}[])used+=Number(variant.byte_size ?? 0);
      }
      if((page.data?.length ?? 0)<500)break;
    }
    meter.used=used;meter.updated=Date.now();
  })();
  try{await meter.loading;}finally{meter.loading=undefined;}
  if(meter.used+additionalBytes>gb*1e9)throw new CmsError("The configured archive storage budget has been reached. No new files were uploaded. Review retained/replaced uploads before increasing the budget.",409);
  const used=meter.used;meter.used+=additionalBytes;
  // Reservations that fail before DB insertion conservatively expire at the
  // next 60s resample. Do not scan 5,000 asset records for every single upload.
  return {used,limit:gb*1e9};
}
