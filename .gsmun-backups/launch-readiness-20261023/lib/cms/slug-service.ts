import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentId } from "./model";
import { databaseError } from "./http";
import { CmsError } from "./errors";

export const slugCheckSchema=z.object({
  checkSlug:z.enum(["books","sections"]),
  slug:z.string().min(1).max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  parent:z.string().uuid().optional(),exclude:contentId.optional(),
}).refine(value=>value.checkSlug!=="sections" || !!value.parent,{message:"Select the parent archive first."});

export function slugConflict(entity:"books"|"sections"){
  return new CmsError(entity==="books" ? "That book URL slug is already used. Edit the URL slug and try again; your form is unchanged." : "That chapter URL slug is already used in this book. Choose a different slug; your form is unchanged.",409);
}
/** Administrator-only callers. The installed unique constraints remain the
 * authority in case another request wins between validation and saving. */
export async function slugAvailable(db:SupabaseClient,input:unknown){
  const q=slugCheckSchema.parse(input);
  let query=db.from(q.checkSlug).select("id").eq("slug",q.slug);
  if(q.checkSlug==="sections")query=query.eq("archive_id",q.parent!);
  if(q.exclude)query=query.neq("id",q.exclude);
  const result=await query.limit(1);databaseError(result.error);
  return {available:!result.data?.length};
}
export async function assertSlugAvailable(db:SupabaseClient,input:unknown){
  const q=slugCheckSchema.parse(input);
  if(!(await slugAvailable(db,q)).available)throw slugConflict(q.checkSlug);
}
