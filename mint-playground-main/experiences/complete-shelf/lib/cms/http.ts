import { NextResponse } from "next/server";
import { AdminAccessError } from "../supabase/server";
import { CmsError } from "./errors";
import { ZodError } from "zod";
import { RequestOriginError } from "./model";
export async function readJson(request:Request,limit=65536) {
  try { return JSON.parse((await readBytes(request,limit)).toString("utf8")); }
  catch (error) { if (error instanceof SyntaxError) throw new CmsError("The request is not valid JSON."); throw error; }
}
export async function readBytes(request:Request,limit:number) {
  const reader = request.body?.getReader();
  if (!reader) throw new CmsError("Request body is required.");
  const chunks: Uint8Array[] = []; let size=0;
  for (;;) {
    const {done,value} = await reader.read(); if(done) break;
    size+=value.byteLength;
    if(size>limit) {await reader.cancel();throw new CmsError("Request body is too large.",413);}
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export function adminError(error:unknown) {
  const safe = error instanceof AdminAccessError || error instanceof CmsError || error instanceof RequestOriginError;
  const message = safe ? error.message : error instanceof ZodError ? "Invalid form values. Check required fields, lengths and allowed values." : "Operation failed. Your form has been kept; retry or refresh the list to check its result.";
  return NextResponse.json({error:message},{status:safe ? error.status : error instanceof ZodError ? 400 : 503,headers:{"Cache-Control":"private, no-store"}});
}
export function databaseError(error:{code?:string;message?:string}|null) {
  if(!error) return;
  if(error.code === "23505") throw new CmsError("That identifier or slug already exists. Refresh the list before retrying.",409);
  if(error.code === "23503") throw new CmsError("This asset is still in use, or the parent content no longer exists.",409);
  if(error.code === "PGRST116") throw new CmsError("This record no longer exists or was changed elsewhere. Refresh the list.",409);
  if(error.code === "42501") throw new AdminAccessError(403,"Administrator access is required.");
  throw new CmsError("The database could not confirm the operation. Check the list before retrying.",503);
}
