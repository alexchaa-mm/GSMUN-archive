"use client";
import { useEffect, useState } from "react";
import type { PublicBook } from "./catalog";
import { CommitteeArchive } from "./CommitteeArchive";
import { ContentState } from "./ContentState";

export function PublicArchive({ book, remote, onBackToShelf }: {book:PublicBook;remote:boolean;onBackToShelf:()=>void}) {
  const [content,setContent] = useState<PublicBook | null>(remote ? null : book);
  const [error,setError] = useState(false);
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    if (!remote) return;
    const controller = new AbortController();
    fetch(`/api/content/books/${encodeURIComponent(book.id)}`,{signal:controller.signal,cache:"no-store"})
      .then(async response => { if(!response.ok) throw new Error("Unavailable"); return response.json(); })
      .then(setContent).catch(() => {if(!controller.signal.aborted) setError(true);});
    return () => controller.abort();
  },[book.id,remote,attempt]);
  if (content) return <CommitteeArchive book={content} onBackToShelf={onBackToShelf} />;
  return <div style={{position:"fixed",inset:0,zIndex:100}}><ContentState>
    <p role="status">{error ? "This archive is currently unavailable." : "Opening archive…"}</p>
    {error ? <button type="button" onClick={() => {setError(false);setAttempt(value=>value+1);}}>Try again</button> : null}
    <button type="button" onClick={onBackToShelf}>← Back to archive</button>
  </ContentState></div>;
}
