import "server-only";
import {GoogleAuth} from "google-auth-library";
import {readFile,stat} from "node:fs/promises";
import {resolve,sep,isAbsolute} from "node:path";
import {CmsError} from "./errors";
import {MAX_UPLOAD_BYTES} from "./model";
export type DriveFile={id:string;name:string;mimeType:string;size?:string;md5Checksum?:string;version?:string;modifiedTime?:string;parents?:string[];trashed?:boolean;capabilities?:{canDownload?:boolean}};
export interface DriveClient{get(id:string):Promise<DriveFile>;list(parent:string,page?:string):Promise<{files:DriveFile[];nextPageToken?:string}>;download(id:string):Promise<Buffer>;startToken():Promise<string>;changes(token:string):Promise<{changes:{file?:DriveFile;removed?:boolean}[];nextPageToken?:string;newStartPageToken?:string}>;}
export const driveId=(id:string)=>{if(!/^[a-zA-Z0-9_-]{1,200}$/.test(id))throw new CmsError("Invalid Drive folder or file identifier.");return id;};
// Runtime mounts are intentionally NOT application build assets. Prevent the
// bundler's filesystem tracing from sweeping the repository/private files.
export function privateServerPath(path:string){if(!isAbsolute(path))throw new CmsError("Use an absolute private server file path.",503);const full=resolve(/* turbopackIgnore: true */ path);const publicRoot=resolve(process.cwd(),"public");const compare=process.platform==="win32"?full.toLowerCase():full;const base=process.platform==="win32"?publicRoot.toLowerCase():publicRoot;if(compare===base || compare.startsWith(base+sep))throw new CmsError("Private credentials must not be stored in public files.",503);return full;}
export function driveSettings(){
  const enabled=process.env.GSMUN_DRIVE_ENABLED==="1";
  const root=process.env.GSMUN_DRIVE_ROOT_FOLDER_ID ?? "";const keyFile=process.env.GSMUN_DRIVE_KEY_FILE ?? "";
  return {enabled,configured:enabled && !!keyFile && /^[a-zA-Z0-9_-]{1,200}$/.test(root),root,keyFile};
}
const fields="id,name,mimeType,size,md5Checksum,version,modifiedTime,parents,trashed,capabilities(canDownload)";
export async function googleDriveClient():Promise<DriveClient>{
  const settings=driveSettings();if(!settings.configured)throw new CmsError("Drive is not connected. Configure and explicitly enable the private folder integration after approval.",503);
  const path=privateServerPath(settings.keyFile);const info=await stat(/* turbopackIgnore: true */ path).catch(()=>null);if(!info || info.size>32768)throw new CmsError("Private Drive credential file is unavailable.",503);
  let credentials;try{credentials=JSON.parse(await readFile(/* turbopackIgnore: true */ path,"utf8"));}catch{throw new CmsError("Private Drive credentials could not be read.",503);}
  if(credentials.type!=="service_account" || !/^[^@]+@[^@]+\.iam\.gserviceaccount\.com$/.test(credentials.client_email ?? "") || !String(credentials.private_key).includes("PRIVATE KEY") || (credentials.universe_domain && credentials.universe_domain!=="googleapis.com") || (credentials.token_uri && credentials.token_uri!=="https://oauth2.googleapis.com/token"))throw new CmsError("Use a dedicated Google service-account credential with the standard Google token endpoint.",503);
  const auth=new GoogleAuth({credentials,scopes:["https://www.googleapis.com/auth/drive.readonly"]});
  async function request(path:string,params:Record<string,string>={}){
    const url=new URL("https://www.googleapis.com/drive/v3/"+path);for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
    for(let attempt=0;attempt<3;attempt++){
      let token;try{token=await auth.getAccessToken();}catch{throw new CmsError("Drive authorization failed. Check the service account and folder sharing; no archive content was changed.",503);}
      const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},redirect:"error",signal:AbortSignal.timeout(60000),cache:"no-store"});
      if(response.ok)return response;
      await response.body?.cancel();
      if([429,500,502,503,504].includes(response.status) && attempt<2){await new Promise(resolve=>setTimeout(resolve,500*2**attempt));continue;}
      throw new CmsError(response.status===404 ? "Drive file is missing or inaccessible. Existing archive copies are retained." : response.status===403 || response.status===429 ? "Drive permission or quota limit reached. Check folder access and retry later." : response.status===410 ? "Drive change token expired. Run a reconciliation scan." : "Drive request failed. Retry later; existing archive content is retained.",response.status===410 ? 410 : 503);
    }
    throw new CmsError("Drive request unavailable.",503);
  }
  return {
    get:async id=>(await request(`files/${driveId(id)}`,{fields,supportsAllDrives:"true"})).json(),
    list:async(parent,page)=>(await request("files",{q:`'${driveId(parent)}' in parents and trashed = false`,pageSize:"100",fields:`nextPageToken,files(${fields})`,supportsAllDrives:"true",includeItemsFromAllDrives:"true",...(page?{pageToken:page}:{})})).json(),
    startToken:async()=>{const value=await (await request("changes/startPageToken",{supportsAllDrives:"true"})).json();if(!value.startPageToken)throw new CmsError("Drive change cursor unavailable.",503);return value.startPageToken;},
    changes:async token=>(await request("changes",{pageToken:token,pageSize:"100",fields:`nextPageToken,newStartPageToken,changes(removed,file(${fields}))`,supportsAllDrives:"true",includeItemsFromAllDrives:"true"})).json(),
    download:async id=>{
      const response=await request(`files/${driveId(id)}`,{alt:"media",supportsAllDrives:"true"});
      const declared=Number(response.headers.get("content-length"));if(declared>MAX_UPLOAD_BYTES){await response.body?.cancel();throw new CmsError("Drive image exceeds the 30 MiB upload limit.",413);}
      const reader=response.body?.getReader();if(!reader)throw new CmsError("Drive returned no image bytes.",503);
      const chunks:Uint8Array[]=[];let length=0;
      for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_UPLOAD_BYTES){await reader.cancel();throw new CmsError("Drive image exceeds the 30 MiB upload limit.",413);}chunks.push(value);}
      return Buffer.concat(chunks);
    },
  };
}
