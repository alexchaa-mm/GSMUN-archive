import { NextResponse } from "next/server";
import { publicDatabase } from "../../../../../../lib/supabase/server";
import { contentId } from "../../../../../../lib/cms/model";
import { publicGalleryPage, galleryQuery } from "../../../../../../lib/cms/public-gallery";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const id=contentId.safeParse((await params).id);
  const query=galleryQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const headers={"Cache-Control":"private, no-store"};
  if (!id.success || !query.success) return NextResponse.json({error:"Invalid gallery request."},{status:400,headers});
  try {
    const page=await publicGalleryPage(publicDatabase(),id.data,query.data);
    return page ? NextResponse.json(page,{headers}) : NextResponse.json({error:"Archive not found."},{status:404,headers});
  } catch { return NextResponse.json({error:"Photographs are temporarily unavailable. Please retry."},{status:503,headers}); }
}
