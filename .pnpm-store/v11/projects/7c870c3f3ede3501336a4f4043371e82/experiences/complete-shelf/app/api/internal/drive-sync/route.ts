import {NextResponse} from "next/server";
import {verifyWorkerRequest,workerDatabase} from "../../../../lib/cms/drive-worker";
import {driveSettings,googleDriveClient} from "../../../../lib/cms/drive-client";
import {syncDrive} from "../../../../lib/cms/drive-import";
import {adminError} from "../../../../lib/cms/http";
export const runtime="nodejs";
let active=false;
export async function POST(request:Request){try{await verifyWorkerRequest(request);if(active)return NextResponse.json({busy:true},{status:409});active=true;try{const db=await workerDatabase();return NextResponse.json(await syncDrive(db,await googleDriveClient(),driveSettings().root),{headers:{"Cache-Control":"private, no-store"}});}finally{active=false;}}catch(error){return adminError(error);}}
