import {NextResponse} from "next/server";
import {requireAdmin} from "../../../../lib/supabase/server";
import {rows} from "../../../../lib/cms/content";
import {adminError} from "../../../../lib/cms/http";

export async function GET(){
  try{
    const {db}=await requireAdmin();
    const data:Record<string,unknown[]>={};
    for(const table of ["books","archives","sections","photos","assets"])data[table]=await rows(db,table);
    return NextResponse.json({format_version:1,created_at:new Date().toISOString(),private_content_backup:true,includes_files:false,includes_auth_or_policies:false,publication_requires_review:true,data},{headers:{"Cache-Control":"private, no-store","Content-Disposition":`attachment; filename="GSMUN-content-${new Date().toISOString().slice(0,10)}.json"`,"X-Content-Type-Options":"nosniff"}});
  }catch(error){return adminError(error);}
}
