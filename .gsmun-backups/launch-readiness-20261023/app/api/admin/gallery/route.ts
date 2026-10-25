import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/supabase/server";
import { contentId } from "../../../../lib/cms/model";
import { publicGalleryPage } from "../../../../lib/cms/public-gallery";
import { adminError } from "../../../../lib/cms/http";
export async function GET(request:Request) {
  try {
    const {db}=await requireAdmin();
    const params=new URL(request.url).searchParams;
    const page=await publicGalleryPage(db,contentId.parse(params.get("book")),Object.fromEntries(params),true);
    return NextResponse.json(page ?? {error:"Archive not found."},{status:page ? 200 : 404,headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {return adminError(error);}
}
