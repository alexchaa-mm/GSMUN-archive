import { NextResponse } from "next/server";
import { getDatabaseBook } from "../../../../../lib/cms/content";
import { contentId } from "../../../../../lib/cms/model";
export async function GET(_request: Request,{params}:{params:Promise<{id:string}>}) {
  const parsed = contentId.safeParse((await params).id);
  if (!parsed.success) return NextResponse.json({error:"Archive not found."},{status:404});
  try {
    const book = await getDatabaseBook(parsed.data);
    if (!book) return NextResponse.json({error:"Archive not found."},{status:404});
    return NextResponse.json(book,{headers:{"Cache-Control":"no-store"}});
  } catch { return NextResponse.json({error:"Archive unavailable."},{status:503}); }
}
