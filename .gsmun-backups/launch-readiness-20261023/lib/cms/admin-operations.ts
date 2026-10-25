import type { SupabaseClient } from "@supabase/supabase-js";
import type { CmsMutation } from "./model";
import { listingSchema, listingOrder, searchColumns, searchPattern } from "./listing";
import { databaseError } from "./http";
import { CmsError } from "./errors";
import { assertSlugAvailable,slugConflict } from "./slug-service";

/** Called only AFTER the route independently verifies administrator membership. */
export async function listAdminContent(db: SupabaseClient, params: URLSearchParams) {
  const { entity, offset, limit, parent, id, search, status, sort,assetKind } = listingSchema.parse(Object.fromEntries(params));
  const order = listingOrder(entity, sort);
  let query = db.from(entity).select("*", { count: "exact" }).order(order.column, { ascending: order.ascending }).order("id").range(offset, offset + limit - 1);
  if (id) query = query.eq("id", id);
  if (parent) query = query.eq(entity === "archives" ? "book_id" : entity === "sections" ? "archive_id" : "section_id", parent);
  if(entity==="assets" && assetKind!=="all")query=query.like("storage_key",assetKind==="artwork" ? "%/artwork/%" : "%/sections/%");
  if (status !== "all") {
    if (entity === "assets" ? !["processing", "ready", "failed"].includes(status) : !["draft", "published", "archived"].includes(status)) throw new CmsError("Invalid status for this collection.");
    query = query.eq(entity === "assets" ? "processing_status" : "status", status);
  }
  if (search) query = query.or(searchColumns(entity).map(column => `${column}.ilike.${searchPattern(search)}`).join(","));
  const result = await query; databaseError(result.error);
  if (entity === "photos" && result.data?.length) {
    const assets=await db.from("assets").select("id,original_filename").in("id",[...new Set(result.data.map(photo=>photo.asset_id))]);databaseError(assets.error);
    const names=new Map(assets.data?.map(asset=>[asset.id,asset.original_filename]) ?? []);
    result.data=result.data.map(photo=>({...photo,original_filename:names.get(photo.asset_id) ?? ""}));
  }
  return { data: result.data ?? [], count: result.count ?? 0, offset, limit };
}
async function editable(db: SupabaseClient, entity: string, id: string) {
  const result = await db.from(entity).select("id,status").eq("id", id).single(); databaseError(result.error);
  if (!result.data) throw new CmsError("Content not found. Refresh the list.", 404);
  if (result.data.status === "published") throw new CmsError("Unpublish this item before editing, replacing artwork or deleting it. Draft changes are never published automatically.", 409);
  return result.data.status as string;
}
async function readyAsset(db: SupabaseClient, id: string | null | undefined) {
  if (!id) return;
  const result = await db.from("assets").select("id").eq("id", id).eq("processing_status", "ready").single(); databaseError(result.error);
}
export async function mutateAdminContent(db: SupabaseClient, action: CmsMutation) {
  let id: string | undefined;
  switch (action.action) {
    case "create-book": {
      if (action.values.cover_asset_id || action.values.spine_asset_id || action.values.back_asset_id) throw new CmsError("Create the draft book first, then attach artwork.");
      await assertSlugAvailable(db,{checkSlug:"books",slug:action.values.slug});
      const result = await db.rpc("create_archive_book", { payload: action.values }); if(result.error?.code==="23505")throw slugConflict("books");databaseError(result.error); id = result.data; break;
    }
    case "edit-book": {
      const status = await editable(db, "books", action.id);
      await assertSlugAvailable(db,{checkSlug:"books",slug:action.values.slug,exclude:action.id});
      const metadata = { ...action.values };
      // A metadata save must never roll back artwork saved by a separate upload.
      delete metadata.cover_asset_id; delete metadata.spine_asset_id; delete metadata.back_asset_id;
      const result = await db.from("books").update(metadata).eq("id", action.id).eq("status", status).select("id").single(); if(result.error?.code==="23505")throw slugConflict("books");databaseError(result.error); break;
    }
    case "book-status": {
      const result = await db.rpc("set_book_status", { book_id: action.id, new_status: action.status, include_drafts: false }); databaseError(result.error); break;
    }
    case "item-status": {
      const result = await db.from(action.entity).update({ status: action.status }).eq("id", action.id).select("id").single(); databaseError(result.error); break;
    }
    case "artwork": {
      const status = await editable(db, "books", action.id); await readyAsset(db, action.assetId);
      const result = await db.from("books").update({ [`${action.kind}_asset_id`]: action.assetId }).eq("id", action.id).eq("status", status).select("id").single(); databaseError(result.error); break;
    }
    case "edit-archive": {
      const status = await editable(db, "archives", action.id);
      const result = await db.from("archives").update(action.values).eq("id", action.id).eq("status", status).select("id").single(); databaseError(result.error); break;
    }
    case "create-section": {
      if (action.values.status !== "draft") throw new CmsError("New chapters must be saved as drafts. Publish them separately after previewing.");
      await assertSlugAvailable(db,{checkSlug:"sections",slug:action.values.slug,parent:action.values.archive_id});
      const result = await db.from("sections").insert({ ...action.values, status: "draft" }).select("id").single(); if(result.error?.code==="23505")throw slugConflict("sections");databaseError(result.error); id = result.data?.id; break;
    }
    case "edit-section": case "edit-photo": {
      const entity = action.action === "edit-section" ? "sections" : "photos";
      const status = await editable(db, entity, action.id);
      if (action.values.status !== status) throw new CmsError("Save details first; use the separate Publish / Unpublish / Archive controls to change visibility.");
      if(action.action==="edit-section"){
        const current=await db.from("sections").select("archive_id").eq("id",action.id).single();databaseError(current.error);
        await assertSlugAvailable(db,{checkSlug:"sections",slug:action.values.slug,parent:current.data?.archive_id,exclude:action.id});
      }
      const result = await db.from(entity).update(action.values).eq("id", action.id).eq("status", status).select("id").single(); if(action.action==="edit-section" && result.error?.code==="23505")throw slugConflict("sections");databaseError(result.error); break;
    }
    case "move": {
      const result = await db.rpc("move_archive_item", { entity: action.entity, item_id: action.id, before_id: action.beforeId }); databaseError(result.error); break;
    }
    case "assign-photo": {
      const status=await editable(db,"photos",action.id);
      const target=await db.from("sections").select("id,archive_id").eq("id",action.sectionId).single();databaseError(target.error);
      if(!target.data)throw new CmsError("Select an existing destination chapter.",404);
      const last=await db.from("photos").select("sort_order").eq("section_id",action.sectionId).order("sort_order",{ascending:false}).limit(1);databaseError(last.error);
      const updated=await db.from("photos").update({section_id:action.sectionId,sort_order:(last.data?.[0]?.sort_order ?? 0)+10,status:"draft"}).eq("id",action.id).eq("status",status).select("id").single();databaseError(updated.error);
      // Object location is immutable. Publication follows the photo's CURRENT
      // chapter relation, not the historical upload folder. Never republish here.
      break;
    }
    case "rename-photo": {
      await editable(db,"photos",action.id);
      const photo=await db.from("photos").select("asset_id").eq("id",action.id).single();databaseError(photo.error);
      if(!photo.data)throw new CmsError("Photograph no longer exists.",404);
      const published=await db.from("photos").select("id").eq("asset_id",photo.data.asset_id).eq("status","published").limit(1);databaseError(published.error);
      if(published.data?.length)throw new CmsError("Unpublish all uses of this image before changing its download filename.",409);
      const result=await db.from("assets").update({original_filename:action.filename}).eq("id",photo.data.asset_id).select("id").single();databaseError(result.error);break;
    }
    case "delete": {
      if (action.entity === "assets") throw new CmsError("Stored assets are retained for recovery. Storage deletion requires a separate reviewed maintenance operation.", 409);
      const status = await editable(db, action.entity, action.id);
      const result = await db.from(action.entity).delete().eq("id", action.id).eq("status", status).select("id").single(); databaseError(result.error); break;
    }
  }
  return { ok: true, id };
}
