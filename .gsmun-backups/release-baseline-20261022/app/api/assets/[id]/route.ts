import { NextResponse } from "next/server";
import { z } from "zod";
import { publicDatabase, sessionDatabase } from "../../../../lib/supabase/server";
import type { AssetRow } from "../../../../lib/cms/model";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return new NextResponse("Image not found",{status:404});
  const variant = new URL(request.url).searchParams.get("variant") ?? "original";
  if (!["original","viewer","thumbnail"].includes(variant)) return new NextResponse("Invalid image variant",{status:400});
  try {
    // Anonymous public assets first; authenticated preview can read drafts via RLS.
    let db = publicDatabase();
    let result = await db.from("assets").select("*").eq("id",id.data).maybeSingle();
    if (!result.data) {
      db = await sessionDatabase();
      const identity = await db.auth.getUser();
      if (!identity.data.user || identity.error) return new NextResponse("Image not found",{status:404});
      result = await db.from("assets").select("*").eq("id",id.data).maybeSingle();
    }
    const asset = result.data as AssetRow | null;
    if (result.error || !asset || asset.processing_status !== "ready") return new NextResponse("Image not found",{status:404});
    if (asset.source_url) {
      const url = variant === "thumbnail" ? asset.thumbnail_url ?? asset.source_url : asset.source_url;
      if (/(^|\.)unsplash\.com$/i.test(new URL(url).hostname)) return new NextResponse("Image not found",{status:404});
      return NextResponse.redirect(url);
    }
    const selected = asset.variants[variant];
    const key = selected?.storage_key ?? asset.storage_key;
    if (!key) return new NextResponse("Image not found",{status:404});
    // The SDK handles both JWT anon keys and the newer publishable keys correctly.
    // It also preserves the verified admin session for private draft previews.
    const downloaded = await db.storage.from("archive-assets").download(key);
    if (downloaded.error || !downloaded.data) return new NextResponse("Image unavailable",{status:404});
    return new NextResponse(await downloaded.data.arrayBuffer(),{headers:{"Content-Type":selected?.mime_type ?? asset.mime_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch { return new NextResponse("Image unavailable",{status:503}); }
}
