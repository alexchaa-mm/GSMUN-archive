"use client";
import { useState } from "react";
import type { ArchiveRow, BookRow, SectionRow } from "../../lib/cms/model";
import { changeContent, getContent } from "./admin-client";
import { CollectionState, CollectionTools, ItemStatus, deleteContent, DropOrder, OrderControls, useCollection, type RunAction } from "./AdminDashboard";
import { PhotoManager } from "./PhotoManager";
import styles from "./admin.module.css";

export function SectionManager({ book, run }: { book: BookRow; run: RunAction }) {
  const archives = useCollection<ArchiveRow>("archives", book.id);
  const archive = archives.items[0];
  return <><CollectionState collection={archives} />{archive && <ArchiveEditor key={archive.id} archive={archive} book={book} run={run} reload={archives.reload} />}
    {!archives.loading && !archives.error && !archive && <p role="alert">This book has no archive record. Review the import before adding chapters.</p>}</>;
}
function ArchiveEditor({ archive, book, run, reload }: { archive: ArchiveRow; book: BookRow; run: RunAction; reload: () => Promise<void> }) {
  const sections = useCollection<SectionRow>("sections", archive.id);
  const [title, setTitle] = useState(archive.title);
  const [description, setDescription] = useState(archive.description);
  const [selected, setSelected] = useState<SectionRow | null>(null);
  const [creating, setCreating] = useState(false);
  async function refresh(id: string) {
    setSelected(await getContent<SectionRow>("sections", id, archive.id));
    await sections.reload(); setCreating(false);
  }
  return <>
    <div className={styles.panel}><h2>Archive heading</h2>
      <p className={styles.hint}>Unpublish the book before editing its archive heading. Save and preview before publishing again.</p>
      <form onSubmit={event => { event.preventDefault(); void run(async () => { await changeContent({ action: "edit-archive", id: archive.id, values: { title, description } }); await reload(); }); }}>
        <fieldset className={styles.lock} disabled={book.status === "published"}><div className={styles.fields}>
          <label>Archive title<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>
          <label>Committee subtitle / archive description<textarea maxLength={6000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        </div><button type="submit">Save archive heading</button></fieldset>
      </form></div>
    <div className={styles.panel}><div className={styles.toolbar}><h2>Sections · {book.title}</h2><button onClick={() => { setCreating(true); setSelected(null); }}>Add section</button></div>
      <CollectionState collection={sections} /><CollectionTools collection={sections} />
      {!sections.loading && !sections.items.length && <p>No chapters match this filter.</p>}
      {sections.items.map((section, index) => <DropOrder key={section.id} entity="sections" id={section.id} run={run} reload={sections.reload}>
        <div className={styles.row}><div><strong>{section.title}</strong><small>{section.status} · Order {section.sort_order} · /{section.slug}<br />ID: {section.id}</small></div><div className={styles.actions}>
          <OrderControls entity="sections" id={section.id} index={index} items={sections.items} hasMore={sections.hasMore} run={run} reload={sections.reload} />
          <button onClick={() => { setSelected(section); setCreating(false); }}>Edit / photos</button>
          <ItemStatus entity="sections" item={section} run={run} reload={async () => { if (selected?.id === section.id) await refresh(section.id); else await sections.reload(); }} />
          <button className={styles.danger} onClick={() => void run(async () => { if (!(await deleteContent("sections", section.id, section.title))) return false; if (selected?.id === section.id) setSelected(null); await sections.reload(); })}>Delete</button>
        </div></div></DropOrder>)}
    </div>
    {creating && <SectionEditor key="new" section={null} archive={archive} run={run} onSaved={refresh} onClose={() => setCreating(false)} />}
    {selected && <><SectionEditor key={selected.id + selected.updated_at} section={selected} archive={archive} run={run} onSaved={refresh} onClose={() => setSelected(null)} />
      <PhotoManager key={selected.id} book={book} section={selected} run={run} /></>}
  </>;
}
function SectionEditor({ section, archive, run, onSaved, onClose }: { section: SectionRow | null; archive: ArchiveRow; run: RunAction; onSaved: (id: string) => Promise<void>; onClose: () => void }) {
  const [values, setValues] = useState({ title: section?.title ?? "", slug: section?.slug ?? "", sort_order: section?.sort_order ?? 100, status: section?.status ?? "draft" });
  return <div className={styles.panel}><div className={styles.toolbar}><h2>{section ? "Edit chapter" : "New draft chapter"}</h2><button onClick={onClose}>Close chapter editor</button></div>
    <p className={styles.hint}>Status: {values.status}. Use the separate chapter-list controls to publish, unpublish or archive. Publishing a chapter never publishes its draft photographs.</p>
    <form onSubmit={event => { event.preventDefault(); void run(async () => {
      const result = await changeContent(section ? { action: "edit-section", id: section.id, values } : { action: "create-section", values: { ...values, archive_id: archive.id } });
      await onSaved(section?.id ?? result.id!);
    }); }}>
      <fieldset className={styles.lock} disabled={section?.status === "published"}><div className={styles.fields}>
        <label>Title<input required maxLength={160} value={values.title} onChange={event => setValues({ ...values, title: event.target.value })} /></label>
        <label>Slug<input required maxLength={160} value={values.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={event => setValues({ ...values, slug: event.target.value })} /></label>
        <label>Order<input type="number" required min={0} max={1000000} value={values.sort_order} onChange={event => setValues({ ...values, sort_order: Number(event.target.value) })} /></label>
      </div><button className={styles.primary} type="submit">Save chapter</button></fieldset>
    </form></div>;
}
