import { NextResponse } from "next/server";
import { publicDatabase } from "../../../../lib/supabase/server";
import { publicSearchQuery,searchArchive } from "../../../../lib/cms/public-search";
export async function GET(request:Request){
  const parsed=publicSearchQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const headers={"Cache-Control":"private, no-store"};
  if(!parsed.success)return NextResponse.json({error:"Invalid search."},{status:400,headers});
  try{return NextResponse.json(await searchArchive(publicDatabase(),parsed.data),{headers});}
  catch{return NextResponse.json({error:"Archive search is temporarily unavailable. Please retry."},{status:503,headers});}
}
