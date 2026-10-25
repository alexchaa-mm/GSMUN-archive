"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AssetRow, BookRow } from "../../lib/cms/model";
import { adminRequest, changeContent, getContent, listContent } from "./admin-client";
import { PAGE_SIZE, type ListOptions } from "../../lib/cms/listing";
import { BookEditor } from "./BookEditor";
import styles from "./admin.module.css";

export type RunAction = (task: () => Promise<void | false>) => Promise<void>;
export function useCollection<T>(entity: string, parent?: string) {
  const [items, setItems] = useState<T[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [options, setOptions] = useState<ListOptions>({ search: "", status: "all", sort: "order" });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current; setLoading(true); setError("");
    try {
      const result = await listContent<T>(entity, parent, offset, options);
      if (request === generation.current) { setItems(result.data); setCount(result.count); }
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : "Could not load content.");
      throw cause;
    } finally { if (request === generation.current) setLoading(false); }
  }, [entity, parent, offset, options]);
  useEffect(() => {
    const controller = new AbortController(); const request = ++generation.current;
    listContent<T>(entity, parent, offset, options, controller.signal).then(result => {
      if (!controller.signal.aborted && request === generation.current) { setItems(result.data); setCount(result.count); setError(""); }
    }).catch(cause => {
      if (!controller.signal.aborted && request === generation.current) setError(cause instanceof Error ? cause.message : "Could not load content.");
    }).finally(() => { if (!controller.signal.aborted && request === generation.current) setLoading(false); });
    return () => controller.abort();
  }, [entity, parent, offset, options]);
  return { items, count, error, loading, reload, offset, options,
    hasMore: offset + items.length < count,
    more: async () => { setLoading(true); setOffset(value => value + PAGE_SIZE); },
    previous: () => { setLoading(true); setOffset(value => Math.max(0, value - PAGE_SIZE)); },
    filter: (next: ListOptions) => { setLoading(true); setOffset(0); setOptions(current => ({ ...current, ...next })); },
  };
}
export function CollectionState({ collection }: { collection: { error: string; loading: boolean; reload: () => Promise<void> } }) {
  if (collection.error) return <div role="alert" className={styles.notice}>{collection.error} <button onClick={() => void collection.reload().catch(() => {})}>Retry</button></div>;
  return collection.loading ? <p role="status">Loading…</p> : null;
}
export function CollectionTools({ collection, assets = false }: { collection: ReturnType<typeof useCollection>; assets?: boolean }) {
  const [search, setSearch] = useState(collection.options.search ?? "");
  return <><form className={styles.toolbar} onSubmit={event => { event.preventDefault(); collection.filter({ search }); }}>
    <label>Search<input maxLength={120} value={search} onChange={event => setSearch(event.target.value)} /></label><button type="submit">Search</button>
    <label>Status<select value={collection.options.status} onChange={event => collection.filter({ status: event.target.value as ListOptions["status"] })}>
      {(assets ? ["all", "processing", "ready", "failed"] : ["all", "draft", "published", "archived"]).map(status => <option key={status}>{status}</option>)}
    </select></label><label>Sort<select value={collection.options.sort} onChange={event => collection.filter({ sort: event.target.value as ListOptions["sort"] })}>
      {["order", "newest", "oldest", "name"].map(sort => <option key={sort}>{sort}</option>)}
    </select></label>
  </form><div className={styles.toolbar}><span>{collection.count ? collection.offset + 1 : 0}–{Math.min(collection.offset + collection.items.length, collection.count)} of {collection.count}</span>
    <button disabled={collection.loading || !collection.offset} onClick={collection.previous}>Previous page</button>
    <button disabled={collection.loading || !collection.hasMore} onClick={() => void collection.more()}>Next page</button></div></>;
}
export function ItemStatus({ entity, item, run, reload }: { entity: "sections" | "photos"; item: { id: string; status: string }; run: RunAction; reload: () => Promise<void> }) {
  return <><button onClick={() => {
    const status = item.status === "published" ? "draft" : "published";
    if (status === "published" && !window.confirm("Publish this item only? Its parent must also be published for public visibility. Draft descendants stay private.")) return;
    void run(async () => { await changeContent({ action: "item-status", entity, id: item.id, status }); await reload(); });
  }}>{item.status === "published" ? "Unpublish" : "Publish"}</button><button onClick={() => void run(async () => { await changeContent({ action: "item-status", entity, id: item.id, status: "archived" }); await reload(); })}>Archive</button></>;
}
export function OrderControls({ entity, id, index, items, run, reload, hasMore = false }: { entity: "books" | "sections" | "photos"; id: string; index: number; items: { id: string }[]; run: RunAction; reload: () => Promise<void>; hasMore?: boolean }) {
  function move(beforeId: string | null) { void run(async () => { await changeContent({ action: "move", entity, id, beforeId }); await reload(); }); }
  return <><button aria-label="Move earlier" disabled={index === 0} onClick={() => move(items[index - 1].id)}>↑</button><button aria-label="Move later" disabled={index === items.length - 1 || (hasMore && index === items.length - 2)} onClick={() => move(items[index + 2]?.id ?? null)}>↓</button><button onClick={() => { const beforeId = window.prompt("Move before this exact content ID (blank = end of this book/chapter collection):"); if (beforeId !== null && beforeId !== id) move(beforeId || null); }}>Move to…</button></>;
}
export async function deleteContent(entity: "books" | "sections" | "photos" | "assets", id: string, label: string) {
  if (!window.confirm(`Permanently delete ${label}? Books and sections also delete their contained records. This cannot be undone. Consider unpublishing instead.`)) return false;
  const result = await changeContent({ action: "delete", entity, id, confirmation: "DELETE" });
  if (result.warning) window.alert(result.warning);
  return true;
}
export function DropOrder({ entity, id, children, run, reload }: { entity: "books" | "sections" | "photos"; id: string; children: React.ReactNode; run: RunAction; reload: () => Promise<void> }) {
  return <div draggable onDragStart={event => { event.dataTransfer.setData("application/x-gsmun-order", JSON.stringify({ entity, id })); }}
    onDragOver={event => { if (Array.from(event.dataTransfer.types).includes("application/x-gsmun-order")) event.preventDefault(); }}
    onDrop={event => {
      const raw = event.dataTransfer.getData("application/x-gsmun-order"); if (!raw) return;
      event.preventDefault();
      try { const moving = JSON.parse(raw); if (moving.entity === entity && typeof moving.id === "string" && moving.id !== id) void run(async () => { await changeContent({ action: "move", entity, id: moving.id, beforeId: id }); await reload(); }); } catch { /* Ignore unrelated drag data. */ }
    }}>{children}</div>;
}
export default function AdminDashboard({ email }: { email: string }) {
  const [tab, setTab] = useState("Books");
  const books = useCollection<BookRow>("books");
  const [selected, setSelected] = useState<BookRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run: RunAction = async task => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try { if (await task() !== false) setMessage("Server confirmed the operation. Lists have been refreshed."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "The operation failed. Your form has been kept."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  async function status(book: BookRow, value: "draft" | "published" | "archived") {
    if (value === "published" && !window.confirm("Publish this book and its archive only? Chapters and photographs keep their individual statuses. Preview before publishing.")) return false;
    await changeContent({ action: "book-status", id: book.id, status: value, includeDrafts: false });
    await books.reload();
  }
  const current = selected;
  function open(book: BookRow) { setSelected(book); setCreating(false); }
  return <div className={styles.shell}>
    <aside className={styles.sidebar}><strong>GSMUN · Content manager</strong><nav aria-label="Admin navigation">
      {["Dashboard", "Books", "Media / Photos", "Settings"].map(name => <button key={name} aria-current={tab === name ? "page" : undefined} onClick={() => { setTab(name); setSelected(null); setCreating(false); }}>{name}</button>)}
      <button onClick={() => void run(async () => { await adminRequest("/api/auth/logout", { method: "POST" }); window.location.assign("/admin/login/"); })}>Log out</button>
    </nav><p>{email}</p><Link href="/" style={{ color: "#fff" }}>View public archive ↗</Link></aside>
    <main className={styles.main}><fieldset className={styles.lock} disabled={busy}>
      {message && <div role="alert" className={styles.notice}>{message} <a href="/admin/login/" target="_blank" rel="noreferrer">Open login in a new tab</a></div>}
      {busy && <p role="status">Saving…</p>}
      {tab === "Dashboard" && <><h1>Archive dashboard</h1><CollectionState collection={books} /><div className={styles.cards}><div className={styles.panel}><p className={styles.stat}>{books.count}</p><p>Books</p></div><div className={styles.panel}><h2>Publishing workflow</h2><p>Create a draft book → add chapters → upload photographs → preview → publish.</p><p>Unpublishing hides the whole volume without deleting its content.</p></div></div><button onClick={() => setTab("Books")}>Manage books</button></>}
      {tab === "Books" && <>
        <div className={styles.toolbar}><h1>Books</h1><button className={styles.primary} onClick={() => { setCreating(true); setSelected(null); }}>Create book</button><button onClick={() => void books.reload().catch(() => {})}>Refresh</button></div>
        <CollectionState collection={books} />
        {!creating && !current && <CollectionTools collection={books} />}
        {creating && <BookEditor key="new" book={null} run={run} onSaved={async id => { setSelected(await getContent<BookRow>("books",id)); await books.reload(); setCreating(false); }} onClose={() => setCreating(false)} />}
        {current && <BookEditor key={current.id} book={current} run={run} onSaved={async id => { setSelected(await getContent<BookRow>("books",id)); await books.reload(); }} onClose={() => setSelected(null)} />}
        {!creating && !current && <div className={styles.panel}>
          {!books.loading && !books.items.length && <p>No books yet. Create your first draft volume.</p>}
          <p className={styles.hint}>Drag a row before another row to reorder, or use the arrow controls. Ordering never changes book dimensions.</p>
          {books.items.map((book, index) => <DropOrder key={book.id} entity="books" id={book.id} run={run} reload={books.reload}><div className={styles.row}><div><strong>{book.title}</strong><small>{book.committee_name} · {book.status} · Order {book.sort_order}<br />Updated {new Date(book.updated_at).toLocaleString()}</small></div><div className={styles.actions}>
            <OrderControls entity="books" id={book.id} index={index} items={books.items} hasMore={books.hasMore} run={run} reload={books.reload} />
            <button onClick={() => open(book)}>Edit / sections / photos</button><a href={`/admin/preview/${book.id}/`} target="_blank" rel="noreferrer">Preview ↗</a>
            <button onClick={() => void run(() => status(book, book.status === "published" ? "draft" : "published"))}>{book.status === "published" ? "Unpublish" : "Publish"}</button>
            <button onClick={() => void run(() => status(book, "archived"))}>Archive</button>
            <button className={styles.danger} onClick={() => void run(async () => { if (!(await deleteContent("books", book.id, book.title))) return false; await books.reload(); })}>Delete</button>
          </div></div></DropOrder>)}
          
        </div>}
      </>}
      {tab === "Media / Photos" && <MediaManager />}
      {tab === "Settings" && <><h1>Settings</h1><div className={styles.panel}><h2>Administrator account</h2><p>{email}</p><p>Accounts are provisioned privately in Supabase Auth. Only users in the archive_admins table can manage content. Public registration is not available.</p><p className={styles.hint}>Use the Supabase dashboard for password recovery, rate limits, account removal and future MFA enforcement. See docs/SUPABASE-SETUP.md for setup and security requirements.</p><h2>Content backup</h2><a href="/api/admin/export" download>Download private content manifest</a><p className={styles.hint}>Includes draft metadata and image references, not image files, authentication or database policies. Keep it private and back up the original files separately.</p></div></>}
    </fieldset></main>
  </div>;
}
function MediaManager() {
  const assets = useCollection<AssetRow>("assets");
  return <><h1>Media library</h1><p className={styles.hint}>Upload artwork inside a book. Upload photographs inside a selected section. Referenced assets cannot be deleted.</p><CollectionState collection={assets} /><CollectionTools collection={assets} assets /><div className={styles.photos}>
    {assets.items.map(asset => <div className={styles.photo} key={asset.id}>{asset.processing_status === "ready" ? <img src={asset.thumbnail_url ?? `/api/assets/${asset.id}?variant=${!asset.variants?.thumbnail && asset.storage_key?.includes("/artwork/") ? "original" : "thumbnail"}`} alt={asset.original_filename} loading="lazy" onError={event=>{event.currentTarget.alt="Image preview unavailable";}} /> : <p>Image transfer incomplete — original file can be retried.</p>}<strong>{asset.original_filename}</strong><p className={styles.hint}>{asset.width} × {asset.height} · {(asset.byte_size / 1024 / 1024).toFixed(2)} MB · {asset.processing_status}</p><small>Upload ID: {asset.id}<br />Storage: {asset.storage_key ?? "External image"}</small>{asset.processing_status !== "ready" && <p className={styles.hint}>Reselect the original file in its book/chapter upload queue to retry. Retain this ID; existing bytes are never overwritten or deleted automatically.</p>}</div>)}
  </div></>;
}
