export type UploadState = "queued" | "uploading" | "processing" | "success" | "failed" | "cancelled" | "needs-file";
export type UploadReceipt = { id: string; name: string; size: number; modified: number; state: UploadState; error: string; allowDuplicate?: boolean };
export type UploadJob = UploadReceipt & { file?: File; progress: number };
type Transfer = (job: UploadJob, signal: AbortSignal, progress: (percent: number) => void) => Promise<unknown>;

export function uploadId() {
  // getRandomValues is also available in non-secure LAN previews.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Files are references, not decoded images. Only two originals are transferred
 * at once; successful File references are released. Failed jobs keep their ID. */
export class UploadQueue {
  jobs: UploadJob[];
  private controllers = new Map<string, AbortController>();
  private stopped = false;
  private transfer: Transfer;
  private changed: (jobs: UploadJob[], persist: boolean) => void;
  private concurrency: number;
  constructor(transfer: Transfer, changed: (jobs: UploadJob[], persist: boolean) => void,
    receipts: UploadReceipt[] = [], concurrency = 2) {
    this.transfer = transfer; this.changed = changed;
    this.concurrency = Math.max(1, Math.min(3, concurrency));
    this.jobs = receipts.map(receipt => ({ ...receipt, progress: receipt.state === "success" ? 100 : 0,
      state: receipt.state === "success" ? "success" : "needs-file",
      error: receipt.state === "success" ? "" : "Reselect the original file to reconcile or retry this upload safely." }));
  }
  receipts(): UploadReceipt[] { return this.jobs.map(({ id, name, size, modified, state, error, allowDuplicate }) => ({ id, name, size, modified, state, error, allowDuplicate })); }
  recover(file: File, id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error("Enter the exact upload UUID shown in the media library.");
    const existing = this.jobs.find(job => job.id === id);
    if (existing && !["failed", "cancelled", "needs-file"].includes(existing.state)) throw new Error("This upload is already active or saved.");
    if (existing) { existing.file = file; existing.name = file.name; existing.size = file.size; existing.modified = file.lastModified; this.retry(id); }
    else {
      this.jobs.push({ id, name: file.name, size: file.size, modified: file.lastModified, file, state: "queued", progress: 0, error: "" });
      this.stopped = false; this.emit(); this.pump();
    }
  }
  add(files: File[], allowMatchingNames = false) {
    this.stopped = false;
    const skipped: string[] = [];
    for (const file of files) {
      const same = allowMatchingNames ? undefined : this.jobs.find(job => job.name === file.name && job.size === file.size && job.modified === file.lastModified);
      if (same?.state === "needs-file") { same.file = file; same.state = "queued"; same.error = ""; }
      else if (!same || ["failed", "cancelled"].includes(same.state)) {
        if (same) { same.file = file; same.state = "queued"; same.error = ""; }
        else this.jobs.push({ id: uploadId(), file, name: file.name, size: file.size, modified: file.lastModified, state: "queued", progress: 0, error: "" });
      }
      else skipped.push(file.name);
      // Metadata matching is a warning, not proof of identical image bytes.
    }
    this.emit(); this.pump();
    return skipped;
  }
  retry(id: string, allowDuplicate = false) {
    const job = this.jobs.find(value => value.id === id);
    if (!job || this.controllers.has(id) || job.state === "success") return;
    job.allowDuplicate = allowDuplicate;
    job.state = job.file ? "queued" : "needs-file"; job.progress = 0; job.error = job.file ? "" : "Reselect the original file.";
    this.stopped = false; this.emit(); this.pump();
  }
  cancel(id: string) {
    const job = this.jobs.find(value => value.id === id);
    if (!job || job.state === "success") return;
    job.state = "cancelled"; job.error = "Transfer stopped locally. The server may have saved it; retry uses the same identity.";
    this.controllers.get(id)?.abort(); this.emit();
  }
  pause() {
    this.stopped = true;
    for (const job of this.jobs) if (["queued", "uploading", "processing"].includes(job.state)) {
      job.state = "cancelled"; job.error = "Transfer paused locally. Retry the same identity to reconcile its server result.";
      this.controllers.get(job.id)?.abort();
    }
    this.emit();
  }
  private emit(persist = true) { this.changed(this.jobs.map(job => ({ ...job })), persist); }
  private pump() {
    if (this.stopped) return;
    for (const job of this.jobs) {
      if (this.controllers.size >= this.concurrency) break;
      if (job.state !== "queued" || !job.file) continue;
      const controller = new AbortController(); this.controllers.set(job.id, controller);
      job.state = "uploading"; job.progress = 0; this.emit();
      void Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error("Transfer cancelled.");
        return this.transfer(job, controller.signal, percent => {
          if (controller.signal.aborted) return;
          job.progress = Math.max(0, Math.min(100, percent)); job.state = percent >= 100 ? "processing" : "uploading"; this.emit(false);
        });
      }).then(() => {
        // A response confirming success wins over a late local cancellation.
        job.state = "success"; job.progress = 100; job.error = ""; job.file = undefined;
      }).catch(error => {
        if (!controller.signal.aborted) { job.state = "failed"; job.error = error instanceof Error ? error.message : "Upload failed; retry with the same identity."; }
      }).finally(() => { this.controllers.delete(job.id); this.emit(); this.pump(); });
    }
  }
}
