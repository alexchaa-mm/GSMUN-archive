import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionDatabase, AdminAccessError } from "../../../../lib/supabase/server";
import { assertSameOrigin } from "../../../../lib/cms/model";
import { readJson, adminError } from "../../../../lib/cms/http";
import { loginFailure } from "../../../../lib/cms/errors";
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const values = z.object({email:z.string().email().max(320),password:z.string().min(1).max(1024)}).parse(await readJson(request,8192));
    const db = await sessionDatabase();
    const {error} = await db.auth.signInWithPassword(values);
    if(error) throw loginFailure(error);
    const membership = await db.rpc("is_archive_admin");
    if(membership.error || membership.data !== true) {
      await db.auth.signOut();
      throw new AdminAccessError(membership.error ? 503 : 403,membership.error ? "Administrator membership could not be verified. Please retry." : "This account does not have archive administrator access.");
    }
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {return adminError(error);}
}
