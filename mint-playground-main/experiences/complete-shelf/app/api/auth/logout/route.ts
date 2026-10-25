import { NextResponse } from "next/server";
import { sessionDatabase } from "../../../../lib/supabase/server";
import { assertSameOrigin } from "../../../../lib/cms/model";
import { adminError } from "../../../../lib/cms/http";
import { CmsError } from "../../../../lib/cms/errors";
export async function POST(request:Request) {
  try {assertSameOrigin(request);const db=await sessionDatabase();const result=await db.auth.signOut();if(result.error) throw new CmsError("Could not confirm logout. Keep this tab open and retry.",503);return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});}
  catch(error){return adminError(error);}
}
