import {NextResponse} from "next/server";
import {z} from "zod";
import {requireAdmin} from "../../../../lib/supabase/server";
import {adminError} from "../../../../lib/cms/http";
import {inspectLaunchConfig} from "../../../../lib/cms/launch-readiness.mjs";
import {workerStatus} from "../../../../lib/cms/drive-worker";
export const runtime="nodejs";
export async function GET(request:Request){try{
  const {db}=await requireAdmin();const expected=z.string().regex(/^[a-z0-9]{20}$/).parse(new URL(request.url).searchParams.get("expectedProject"));
  const config=inspectLaunchConfig(process.env,expected);const schema=[];
  for(const [table,column] of [["books","id"],["archives","id"],["sections","id"],["photos","id"],["assets","id"],["archive_navigation","key"],["drive_import_jobs","id"],["drive_folder_mappings","id"],["drive_sync_state","id"]]){
    const result=await db.from(table).select(column).limit(1);schema.push({table,readable:!result.error});
  }
  return NextResponse.json({...config,schema,administratorVerified:true,worker:await workerStatus(),ready:config.ready && schema.every(item=>item.readable),rlsInstallationVerified:false},{headers:{"Cache-Control":"private, no-store"}});
}catch(error){return adminError(error);}}
