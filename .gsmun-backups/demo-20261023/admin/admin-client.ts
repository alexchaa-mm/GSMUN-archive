import type { CmsMutation } from "../../lib/cms/model";
import { validateUpload } from "../../lib/cms/model";
import type { ListOptions } from "../../lib/cms/listing";
import { uploadId } from "../../lib/cms/upload-queue";
export async function adminRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const result = await response.json().catch(() => ({ error: "The server returned an unreadable response. Check the list before retrying." }));
  if (response.status === 401) throw new Error("Session expired. Your form is still here. Open /admin/login/ in another tab, sign in, then retry.");
  if (!response.ok) throw new Error(result.error ?? "Request failed. Your form has been kept.");
  return result;
}
export function listContent<T>(entity: string, parent?: string, offset = 0, options: ListOptions = {}, signal?: AbortSignal) {
  const params = new URLSearchParams({ entity, offset: String(offset), ...Object.fromEntries(Object.entries(options).map(([key, value]) => [key, String(value)])) });
  if (parent) params.set("parent", parent);
  return adminRequest<{ data: T[]; count: number }>(`/api/admin/content?${params}`, { signal });
}
export function changeContent(mutation: CmsMutation) {
  return adminRequest<{ ok: boolean; id?: string; warning?: string }>("/api/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mutation) });
}
export async function getContent<T>(entity: string, id: string, parent?: string) {
  const params = new URLSearchParams({ entity, id }); if (parent) params.set("parent", parent);
  const result = await adminRequest<{ data: T[] }>("/api/admin/content?" + params);
  if (!result.data[0]) throw new Error("The selected content no longer exists. Refresh the list.");
  return result.data[0];
}
export function uploadImage(file: File, bookId: string, kind: string, sectionId: string | undefined, onProgress: (percent: number) => void, photoId?: string,
  options: { id?: string; signal?: AbortSignal; allowDuplicate?: boolean; expectedAssetId?: string | null } = {}) {
  validateUpload(file.type, file.size);
  return new Promise<{ assetId: string }>((resolve, reject) => {
    const form = new FormData(); form.set("file", file); form.set("bookId", bookId); form.set("kind", kind); form.set("uploadId", options.id ?? uploadId());
    if (sectionId) form.set("sectionId", sectionId); if (photoId) form.set("photoId", photoId);
    if (options.allowDuplicate) form.set("allowDuplicate", "true");
    if (kind !== "photo" || photoId) form.set("expectedAssetId", JSON.stringify(options.expectedAssetId ?? null));
    const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/admin/upload"); xhr.timeout = 180000;
    const abort = () => xhr.abort();
    const fail = (message: string) => { options.signal?.removeEventListener("abort", abort); reject(new Error(message)); };
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total * 100); };
    xhr.onerror = () => fail("Upload connection failed. Retry with the same upload ID.");
    xhr.ontimeout = () => fail("Upload timed out. The server may have saved it; retry with the same upload ID.");
    xhr.onabort = () => fail("Transfer cancelled locally. Retry with the same upload ID to check its result.");
    xhr.onload = () => {
      options.signal?.removeEventListener("abort", abort);
      let result; try { result = JSON.parse(xhr.responseText); } catch { fail("Unreadable upload response. Retry with the same upload ID."); return; }
      if (xhr.status === 401) { fail("Session expired. Sign in at /admin/login/ in another tab, then retry."); return; }
      if (xhr.status < 200 || xhr.status >= 300) fail(result.error ?? "Upload failed.");
      else resolve(result);
    };
    if (options.signal?.aborted) { fail("Transfer cancelled."); return; }
    options.signal?.addEventListener("abort", abort, { once: true }); xhr.send(form);
  });
}
