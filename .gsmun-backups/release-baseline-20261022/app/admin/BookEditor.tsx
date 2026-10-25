"use client";
import { useRef, useState } from "react";
import type { AssetRow, BookRow } from "../../lib/cms/model";
import { bookSchema } from "../../lib/cms/model";
import { changeContent, uploadImage } from "./admin-client";
import { CollectionState, CollectionTools, useCollection, type RunAction } from "./AdminDashboard";
import { uploadId } from "../../lib/cms/upload-queue";
import { SectionManager } from "./SectionManager";
import styles from "./admin.module.css";

export function BookEditor({ book, run, onSaved, onClose }: { book: BookRow | null; run: RunAction; onSaved: (id: string) => Promise<void>; onClose: () => void }) {
  const [progress, setProgress] = useState<string>("");
  const [values, setValues] = useState({
    title: book?.title ?? "", short_title: book?.short_title ?? "", slug: book?.slug ?? "",
    committee_name: book?.committee_name ?? "", description: book?.description ?? "", sort_order: book?.sort_order ?? 100,
    physical_height: book?.physical_height ?? 2.15, physical_thickness: book?.physical_thickness ?? 0.24, presentation_variant: book?.presentation_variant ?? 0,
    cover_asset_id: book?.cover_asset_id ?? null, spine_asset_id: book?.spine_asset_id ?? null, back_asset_id: book?.back_asset_id ?? null,
  });
  const pending = useRef<Record<string, { fingerprint: string; id: string }>>({});
  const assets = useCollection<AssetRow>("assets");
  return <>
    <div className={styles.panel}><div className={styles.toolbar}><h2>{book ? `Edit ${book.title}` : "New draft book"}</h2><button onClick={onClose}>Back to books</button>{book && <a href={`/admin/preview/${book.id}/`} target="_blank" rel="noreferrer">Preview volume ↗</a>}</div>
      {book?.status === "published" && <p className={styles.hint}>Unpublish before editing metadata or artwork. Draft chapters/photos can still be managed below.</p>}
      {book && <button onClick={() => void run(async () => { await changeContent({ action: "book-status", id: book.id, status: "draft", includeDrafts: false }); await onSaved(book.id); })}>Keep / make this book a draft</button>}
      <form onSubmit={event => { event.preventDefault(); void run(async () => { const parsed = bookSchema.parse(values); const result = await changeContent(book ? { action: "edit-book", id: book.id, values: parsed } : { action: "create-book", values: parsed }); await onSaved(book?.id ?? result.id!); }); }}>
        <fieldset className={styles.lock} disabled={book?.status === "published"}><div className={styles.fields}>
          {(["title", "short_title", "slug", "committee_name"] as const).map(field => <label key={field}>{({ title: "Book title", short_title: "Short title", slug: "URL slug", committee_name: "Full committee / subtitle" })[field]}<input required={field !== "committee_name"} maxLength={field === "short_title" ? 80 : field === "committee_name" ? 300 : 160} value={values[field]} onChange={event => setValues({ ...values, [field]: event.target.value })} /></label>)}
          <label className={styles.wide}>Description<textarea maxLength={6000} value={values.description} onChange={event => setValues({ ...values, description: event.target.value })} /></label>
          {([{ key: "sort_order", label: "Order", min: 0, max: 1000000, step: 1 }, { key: "physical_height", label: "Physical height (scene units)", min: 1.5, max: 2.5, step: 0.01 }, { key: "physical_thickness", label: "Physical thickness (scene units)", min: 0.12, max: 0.4, step: 0.01 }, { key: "presentation_variant", label: "Existing presentation variant", min: -2, max: 2, step: 1 }] as const).map(field => <label key={field.key}>{field.label}<input type="number" required min={field.min} max={field.max} step={field.step} value={values[field.key]} onChange={event => setValues({ ...values, [field.key]: Number(event.target.value) })} /></label>)}
        </div>
        <p className={styles.hint}>Save metadata before uploading artwork. Size limits keep new books inside the existing engine’s collision-safe envelope. Existing book dimensions are preserved.</p>
        <button className={styles.primary} type="submit">{book ? "Save book metadata" : "Create draft book"}</button></fieldset>
      </form>
    </div>
    {book && <>
      <div className={styles.panel}><h2>Book artwork</h2><p className={styles.hint}>JPEG, PNG or WebP, up to 30 MB. Artwork bytes are stored unchanged: no cropping, mirroring or resizing. Selecting an existing asset saves that artwork immediately.</p><CollectionState collection={assets} /><CollectionTools collection={assets} assets /><div className={styles.artwork}>
        {(["cover", "spine", "back"] as const).map(kind => { const field = `${kind}_asset_id` as const; return <div key={kind}><h3>{kind === "cover" ? "Front cover" : kind === "back" ? "Back cover" : "Spine"}</h3>
          {values[field] && <img loading="lazy" src={`/api/assets/${values[field]}`} alt={`${kind} artwork`} />}
          <label className={styles.field}>Upload {kind}<input disabled={book.status === "published"} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; if (!file) return; event.target.value = ""; void run(async () => { setProgress(`Uploading ${kind}…`); try { const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
          if (pending.current[kind]?.fingerprint !== fingerprint) pending.current[kind] = { fingerprint, id: uploadId() };
          const uploaded = await uploadImage(file, book.id, kind, undefined, percent => setProgress(`Uploading ${kind}: ${Math.round(percent)}%`), undefined, { id: pending.current[kind].id, expectedAssetId: values[field] });
          delete pending.current[kind]; setValues(current => ({ ...current, [field]: uploaded.assetId })); await assets.reload(); await onSaved(book.id); } finally { setProgress(""); } }); }} /></label>
          <label className={styles.field}>Select stored artwork<select disabled={book.status === "published"} value={values[field] ?? ""} onChange={event => { const next = { ...values, [field]: event.target.value || null }; void run(async () => { await changeContent({ action: "artwork", id: book.id, kind, assetId: next[field] }); setValues(next); await onSaved(book.id); }); }}><option value="">Procedural fallback</option>{values[field] && !assets.items.some(asset => asset.id === values[field]) && <option value={values[field]!}>Current artwork</option>}{assets.items.filter(asset => asset.processing_status === "ready").map(asset => <option key={asset.id} value={asset.id}>{asset.original_filename}</option>)}</select></label>
        </div>; })}
      </div>{progress && <p role="status">{progress}</p>}</div>
      <SectionManager key={book.id + book.status} book={book} run={run} />
    </>}
  </>;
}
