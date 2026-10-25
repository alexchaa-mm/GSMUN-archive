import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../../lib/supabase/server";
import { assertSameOrigin, contentId, MAX_UPLOAD_BYTES, validateUpload } from "../../../../lib/cms/model";
import { adminError, readBytes } from "../../../../lib/cms/http";
import { CmsError } from "../../../../lib/cms/errors";
import { processImage } from "../../../../lib/cms/images";
import { checkUploadDestination, storeUpload } from "../../../../lib/cms/upload-service";
import { reserveUploadSlot } from "../../../../lib/cms/upload-slots";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let release: (() => void) | null = null;
  try {
    assertSameOrigin(request);
    const { db } = await requireAdmin();
    release = reserveUploadSlot();
    if (!release) throw new CmsError("Two images are already being processed. Wait, then retry this same upload.", 429);
    const max = MAX_UPLOAD_BYTES + 65536;
    if (Number(request.headers.get("content-length")) > max) throw new CmsError("Each image must be at most 30 MB.", 413);
    const body = await readBytes(request, max);
    const form = await new Response(new Uint8Array(body), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
    const kind = z.enum(["photo", "cover", "spine", "back"]).parse(form.get("kind"));
    const input = {
      id: z.string().uuid().parse(form.get("uploadId")), bookId: contentId.parse(form.get("bookId")), kind,
      sectionId: form.get("sectionId") ? contentId.parse(form.get("sectionId")) : null,
      photoId: form.get("photoId") ? contentId.parse(form.get("photoId")) : null,
      allowDuplicate: form.get("allowDuplicate") === "true",
      expectedAssetId: kind !== "photo" || form.get("photoId") ? z.string().uuid().nullable().parse(JSON.parse(String(form.get("expectedAssetId")))) : undefined,
    };
    const file = form.get("file");
    if (!(file instanceof File)) throw new CmsError("Choose an image to upload.");
    try { validateUpload(file.type, file.size); }
    catch (error) { throw new CmsError(error instanceof Error ? error.message : "Invalid image."); }
    await checkUploadDestination(db, input);
    const bytes = Buffer.from(await file.arrayBuffer());
    let processed;
    try { processed = await processImage(bytes, file.type, kind !== "photo"); }
    catch { throw new CmsError("Unreadable or unsupported image. Use a single-frame JPEG, PNG or WebP, 32–16000 pixels per side and at most 50 megapixels."); }
    return NextResponse.json(await storeUpload(db, input, file, bytes, processed), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminError(error); }
  finally { release?.(); }
}
