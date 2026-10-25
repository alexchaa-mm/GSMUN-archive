import {NextResponse} from "next/server";
import {requireAdmin} from "../../../../lib/supabase/server";
import {rows} from "../../../../lib/cms/content";
import {adminError} from "../../../../lib/cms/http";

export async function GET(){
  try{
    const {db}=await requireAdmin();
    const data:Record<string,unknown[]>={};
    for(const table of ["books","archives","sections","photos","assets"])data[table]=await rows(db,table);
    const unavailable:string[]=[];
    for(const table of ["archive_navigation","drive_import_jobs","drive_folder_mappings","drive_sync_state"]){
      const values:unknown[]=[];
      for(let offset=0;;offset+=500){
        const result=await db.from(table).select("*").order(table==="archive_navigation"?"key":"id").range(offset,offset+499);
        if(["PGRST205","42P01"].includes(result.error?.code ?? "")){unavailable.push(table);break;}
        if(result.error)throw new Error("Optional content backup failed. Retry before relying on this export.");
        values.push(...result.data);if(result.data.length<500){data[table]=values;break;}
      }
    }
    return NextResponse.json({format_version:2,created_at:new Date().toISOString(),private_content_backup:true,includes_files:false,includes_auth_or_policies:false,unavailable_optional_tables:unavailable,publication_requires_review:true,data},{headers:{"Cache-Control":"private, no-store","Content-Disposition":`attachment; filename="GSMUN-content-${new Date().toISOString().slice(0,10)}.json"`,"X-Content-Type-Options":"nosniff"}});
  }catch(error){return adminError(error);}
}
