import {NextResponse} from "next/server";
import {z} from "zod";
import {requireAdmin} from "../../../../lib/supabase/server";
import {assertSameOrigin,contentId} from "../../../../lib/cms/model";
import {readJson,adminError} from "../../../../lib/cms/http";
import {driveSettings,googleDriveClient} from "../../../../lib/cms/drive-client";
import {driveAdminState,saveDriveMapping,mappingSchema} from "../../../../lib/cms/drive-admin";
import {syncDrive,retryDriveJob} from "../../../../lib/cms/drive-import";
import {workerStatus,authorizeWorker,disableWorker} from "../../../../lib/cms/drive-worker";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
const actionSchema=z.discriminatedUnion("action",[z.object({action:z.literal("sync")}),z.object({action:z.literal("authorize-worker")}),z.object({action:z.literal("disable-worker")}),z.object({action:z.literal("retry"),id:contentId}),z.object({action:z.literal("map"),values:mappingSchema})]);
export async function GET(request:Request){try{const {db}=await requireAdmin();return NextResponse.json({...await driveAdminState(db,Object.fromEntries(new URL(request.url).searchParams)),worker:await workerStatus()},{headers});}catch(error){return adminError(error);}}
export async function POST(request:Request){try{assertSameOrigin(request);const {db,user}=await requireAdmin();const action=actionSchema.parse(await readJson(request));let result;
  if(action.action==="map")result=await saveDriveMapping(db,action.values);
  else if(action.action==="retry"){await retryDriveJob(db,action.id,driveSettings().root);result={ok:true};}
  else if(action.action==="authorize-worker")result=await authorizeWorker(db,user.id);
  else if(action.action==="disable-worker")result=await disableWorker();
  else result=await syncDrive(db,await googleDriveClient(),driveSettings().root);
  return NextResponse.json(result,{headers});
}catch(error){return adminError(error);}}
