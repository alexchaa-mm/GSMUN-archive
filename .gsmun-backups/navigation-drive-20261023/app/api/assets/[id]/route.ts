import { NextResponse } from "next/server";
import { z } from "zod";
import { publicDatabase, sessionDatabase } from "../../../../lib/supabase/server";
import type { AssetRow } from "../../../../lib/cms/model";
import { assetStorage } from "../../../../lib/cms/object-storage";
import { originalArtworkPath } from "../../../../lib/cms/original-artwork";
export const runtime = "nodejs";
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
    const originalArt=variant === "original" ? await originalArtworkPath(asset) : undefined;
    if(originalArt && new URL(request.url).searchParams.get("download") !== "1")return new Response(null,{status:307,headers:{Location:originalArt,"Cache-Control":"private, no-store"}});
    if (asset.source_url) {
      const url = variant === "thumbnail" ? asset.thumbnail_url ?? asset.source_url : asset.source_url;
      if (/(^|\.)unsplash\.com$/i.test(new URL(url).hostname)) return new NextResponse("Image not found",{status:404});
      return NextResponse.redirect(url);
    }
    const selected = asset.variants[variant];
    if (variant !== "original" && !selected) return new NextResponse("Image variant unavailable",{status:404,headers:{"Cache-Control":"private, no-store"}});
    const key = selected?.storage_key ?? asset.storage_key;
    if (!key) return new NextResponse("Image not found",{status:404});
    // The SDK handles both JWT anon keys and the newer publishable keys correctly.
    // It also preserves the verified admin session for private draft previews.
    return await assetStorage(db, key).serve(key, selected?.mime_type ?? asset.mime_type, variant === "original" && new URL(request.url).searchParams.get("download") === "1" ? asset.original_filename : undefined, request.headers.get("range"));
  } catch { return new NextResponse("Image unavailable",{status:503}); }
}
