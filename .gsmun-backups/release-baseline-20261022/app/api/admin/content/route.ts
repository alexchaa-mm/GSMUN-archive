import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/supabase/server";
import { assertSameOrigin, mutationSchema } from "../../../../lib/cms/model";
import { readJson, adminError } from "../../../../lib/cms/http";
import { listAdminContent, mutateAdminContent } from "../../../../lib/cms/admin-operations";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const { db } = await requireAdmin();
    return NextResponse.json(await listAdminContent(db, new URL(request.url).searchParams), { headers });
  } catch (error) { return adminError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db } = await requireAdmin();
    return NextResponse.json(await mutateAdminContent(db, mutationSchema.parse(await readJson(request))), { headers });
  } catch (error) { return adminError(error); }
}
