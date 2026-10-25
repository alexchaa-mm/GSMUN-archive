"use client";
import { useEffect, useRef, useState } from "react";
import type { BookRow, PhotoRow, SectionRow } from "../../lib/cms/model";
import { UploadQueue, uploadId, type UploadJob, type UploadReceipt } from "../../lib/cms/upload-queue";
import { changeContent, uploadImage } from "./admin-client";
import { CollectionState, CollectionTools, deleteContent, DropOrder, ItemStatus, OrderControls, useCollection, type RunAction } from "./AdminDashboard";
import styles from "./admin.module.css";

export function PhotoManager({ book, section, run }: { book: BookRow; section: SectionRow; run: RunAction }) {
  const photos = useCollection<PhotoRow>("photos", section.id);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [queuePage, setQueuePage] = useState(0);
  const [recoveryId, setRecoveryId] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const [allowMatchingNames, setAllowMatchingNames] = useState(false);
  const queue = useRef<UploadQueue | null>(null);
  const reload = useRef(photos.reload);
  useEffect(() => { reload.current = photos.reload; }, [photos.reload]);
  useEffect(() => {
    const key = `gsmun-upload-receipts:${book.id}:${section.id}`;
    let receipts: UploadReceipt[] = [];
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (Array.isArray(stored)) receipts = stored.filter(value => value && typeof value.id === "string" && typeof value.name === "string" && Number.isFinite(value.size) && Number.isFinite(value.modified));
    } catch { /* A blocked/full browser store does not prevent uploading. */ }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let savedCount = receipts.length;
    const persistReceipts = () => {
      if (timer) clearTimeout(timer); timer = undefined;
      try { localStorage.setItem(key, JSON.stringify(current.receipts())); } catch { /* Retain in-memory receipts; manual ID recovery remains available. */ }
    };
    const current = new UploadQueue(
      (job, signal, progress) => uploadImage(job.file!, book.id, "photo", section.id, progress, undefined, { id: job.id, signal, allowDuplicate: job.allowDuplicate }),
      (next, persist) => {
        if (alive) setJobs(next);
        if (persist) {
          if (next.length !== savedCount || !next.some(job => ["queued", "uploading", "processing"].includes(job.state)) || !alive) { savedCount = next.length; persistReceipts(); }
          else if (!timer) timer = setTimeout(persistReceipts, 750);
          if (alive && !next.some(job => ["queued", "uploading", "processing"].includes(job.state))) void reload.current().catch(() => {});
        }
      }, receipts);
    queue.current = current; setJobs([...current.jobs]);
    const warn = (event: BeforeUnloadEvent) => {
      persistReceipts();
      if (current.jobs.some(job => ["queued", "uploading", "processing"].includes(job.state))) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => { alive = false; current.pause(); persistReceipts(); queue.current = null; window.removeEventListener("beforeunload", warn); };
  }, [book.id, section.id]);
  const active = jobs.filter(job => ["queued", "uploading", "processing"].includes(job.state)).length;
  const completed = jobs.filter(job => job.state === "success").length;
  const failed = jobs.filter(job => ["failed", "cancelled", "needs-file"].includes(job.state)).length;
  function addFiles(files: File[]) {
    const skipped = queue.current?.add(files, allowMatchingNames) ?? [];
    setSelectionNotice(skipped.length ? `${skipped.length} files match an existing name, size and timestamp and were not queued twice. If these really are different images, enable matching names and reselect them. The server still checks their actual checksums.` : "");
  }
  async function bulk(status: "draft" | "published" | "archived") {
    const ids = selected.filter(id => photos.items.some(photo => photo.id === id));
    if (!ids.length || !window.confirm(`Set ${ids.length} selected photographs to ${status}? Save edited captions first. Other photographs and chapter statuses are unchanged.`)) return;
    await run(async () => {
      const errors: string[] = [];
      for (const id of ids) {
        try { await changeContent({ action: "item-status", entity: "photos", id, status }); }
        catch (error) { errors.push(`${id}: ${error instanceof Error ? error.message : "Failed"}`); }
      }
      await photos.reload(); setSelected([]);
      if (errors.length) throw new Error(`Partial result: ${ids.length - errors.length} saved, ${errors.length} failed. ${errors.slice(0, 3).join("; ")}`);
    });
  }
  return <div className={styles.panel}><h2>Photographs · {book.title} → {section.title}</h2>
    <p className={styles.hint}>New photographs are drafts. Originals are retained; 760px grid and 2400px viewer versions are generated. Two files transfer at a time. Select the same files after an interruption to resume with their saved upload IDs.</p>
    <div className={styles.upload} onDragOver={event => { if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); }} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)); } }}>
      <label>Drop photographs here or select files<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label>
      <label className={styles.selection}><input type="checkbox" checked={allowMatchingNames} onChange={event => setAllowMatchingNames(event.target.checked)} />Allow matching file names/size/time after checking</label>
      {selectionNotice && <p role="status">{selectionNotice}</p>}
      <details><summary>Recover a tracked upload after clearing browser history</summary>
        <label className={styles.field}>Upload ID from the media library<input value={recoveryId} onChange={event => setRecoveryId(event.target.value.trim())} /></label>
        <label className={styles.field}>Reselect that original image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
          try { queue.current?.recover(file, recoveryId); setRecoveryError(""); } catch (error) { setRecoveryError(error instanceof Error ? error.message : "Could not recover upload."); }
        }} /></label><p className={styles.hint}>The server verifies the chapter, file checksum and stored bytes. It will not overwrite a different file.</p>
        {recoveryError && <p role="alert">{recoveryError}</p>}
      </details>
      {!!jobs.length && <><p role="status">{completed} saved · {active} pending · {failed} need attention · {jobs.length} total</p>
        <progress value={completed + jobs.filter(job => job.state !== "success").reduce((sum, job) => sum + job.progress / 100, 0)} max={jobs.length} aria-label="Overall upload progress" />
        <div className={styles.actions}><button disabled={!active} onClick={() => queue.current?.pause()}>Pause transfers</button>
          <button disabled={!failed} onClick={() => jobs.filter(job => ["failed", "cancelled"].includes(job.state)).forEach(job => queue.current?.retry(job.id))}>Retry failed files</button></div>
        <p className={styles.hint}>Cancellation stops this browser transfer; the server may still finish it. Retrying the same upload ID reconciles the result. Do not clear browser storage until uncertain uploads are reconciled.</p>
        <ul className={styles.queue}>{jobs.slice(queuePage * 40, queuePage * 40 + 40).map(job => <li key={job.id}><strong>{job.name}</strong> · {job.state} · {Math.round(job.progress)}%
          <progress value={job.progress} max={100} aria-label={`Progress for ${job.name}`} /><small>ID: {job.id}</small>
          {job.error && <p>{job.error}</p>}
          {["queued", "uploading", "processing"].includes(job.state) && <button onClick={() => queue.current?.cancel(job.id)}>Cancel transfer</button>}
          {["failed", "cancelled", "needs-file"].includes(job.state) && <button disabled={!job.file} onClick={() => queue.current?.retry(job.id)}>Retry same upload</button>}
          {job.error.startsWith("Duplicate warning:") && <button onClick={() => queue.current?.retry(job.id, true)}>Retry as intentional duplicate</button>}
        </li>)}</ul><div className={styles.actions}><button disabled={!queuePage} onClick={() => setQueuePage(value => value - 1)}>Previous upload results</button>
          <button disabled={(queuePage + 1) * 40 >= jobs.length} onClick={() => setQueuePage(value => value + 1)}>Next upload results</button></div></>}
    </div>
    <CollectionTools collection={photos} /><CollectionState collection={photos} />
    {!photos.loading && !photos.items.length && <p>No photographs match this chapter/filter.</p>}
    <div className={styles.toolbar}><button onClick={() => setSelected(photos.items.map(photo => photo.id))}>Select this page</button><button onClick={() => setSelected([])}>Clear selection</button>
      <button disabled={!selected.length} onClick={() => void bulk("published")}>Publish selected</button><button disabled={!selected.length} onClick={() => void bulk("draft")}>Unpublish selected</button><button disabled={!selected.length} onClick={() => void bulk("archived")}>Archive selected</button></div>
    <div className={styles.photos}>{photos.items.map((photo, index) => <DropOrder key={photo.id} entity="photos" id={photo.id} run={run} reload={photos.reload}>
      <label className={styles.selection}><input type="checkbox" checked={selected.includes(photo.id)} onChange={event => setSelected(value => event.target.checked ? [...value, photo.id] : value.filter(id => id !== photo.id))} />Select photograph</label>
      <PhotoEditor key={photo.id + photo.updated_at} photo={photo} book={book} section={section} run={run} reload={photos.reload}>
        <OrderControls entity="photos" id={photo.id} index={index} items={photos.items} run={run} reload={photos.reload} hasMore={photos.hasMore} />
      </PhotoEditor></DropOrder>)}</div>
  </div>;
}
function PhotoEditor({ photo, book, section, run, reload, children }: { photo: PhotoRow; book: BookRow; section: SectionRow; run: RunAction; reload: () => Promise<void>; children: React.ReactNode }) {
  const [values, setValues] = useState({ alt: photo.alt, caption: photo.caption, credit: photo.credit, credit_url: photo.credit_url, status: photo.status, captured_at: photo.captured_at ?? null });
  const [progress, setProgress] = useState("");
  const pending = useRef<{ fingerprint: string; id: string } | null>(null);
  return <div className={styles.photo}><a href={`/api/assets/${photo.asset_id}?variant=viewer`} target="_blank" rel="noreferrer"><img loading="lazy" src={`/api/assets/${photo.asset_id}?variant=thumbnail`} alt={photo.alt || "Archive photograph"} onError={event => { event.currentTarget.alt = "Image unavailable — check the stored asset"; }} /></a>
    <small>{photo.status} · Order {photo.sort_order}<br />Photo ID: {photo.id}</small><div className={styles.actions}><ItemStatus entity="photos" item={photo} run={run} reload={reload} /></div>
    {photo.status === "published" && <p className={styles.hint}>Unpublish before editing or replacing this image.</p>}
    <form onSubmit={event => { event.preventDefault(); void run(async () => { await changeContent({ action: "edit-photo", id: photo.id, values }); await reload(); }); }}>
      <fieldset className={styles.lock} disabled={photo.status === "published"}>
        {(["alt", "caption", "credit", "credit_url"] as const).map(field => <label className={styles.field} key={field}>{({ alt: "Alt text", caption: "Caption (optional)", credit: "Credit (optional)", credit_url: "Credit link (optional)" })[field]}<input maxLength={field === "caption" ? 4000 : field === "alt" ? 2000 : field === "credit" ? 500 : 2048} type={field === "credit_url" ? "url" : "text"} value={values[field]} onChange={event => setValues({ ...values, [field]: event.target.value })} /></label>)}
        <button type="submit">Save photo details</button></fieldset>
    </form><div className={styles.actions}>{children}<button className={styles.danger} onClick={() => void run(async () => { if (!(await deleteContent("photos", photo.id, photo.alt || "this photograph"))) return false; await reload(); })}>Delete</button></div>
    <label className={styles.field}>Replace photograph<input disabled={photo.status === "published"} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
      const file = event.target.files?.[0]; if (!file) return; event.target.value = "";
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, id: uploadId() };
      void run(async () => { try { await uploadImage(file, book.id, "photo", section.id, percent => setProgress(`${Math.round(percent)}%`), photo.id, { id: pending.current!.id, expectedAssetId: photo.asset_id }); pending.current = null; await reload(); } finally { setProgress(""); } });
    }} /></label>{progress && <p role="status">Replacing: {progress}</p>}
  </div>;
}
