"use client";
import { useState } from "react";
import type { PublicBook } from "./catalog";
import { ProgressLibrary } from "./ProgressLibrary";
import { PublicArchive } from "./PublicArchive";
import { ContentState } from "./ContentState";

/** Stable public links enter the existing archive renderer, never a second shelf. */
export function ArchiveRouter({books,remote,initialBook}:{books:PublicBook[];remote:boolean;initialBook?:string}) {
  const [target,setTarget]=useState(initialBook);
  const book=books.find(book=>book.id===target || book.slug===target);
  if (target && !book) return <ContentState><p>This volume is unavailable or no longer published.</p><button onClick={()=>{window.history.replaceState(null,"","/");setTarget(undefined);}}>Back to archive</button></ContentState>;
  if (book) return <PublicArchive book={book} remote={remote} onBackToShelf={()=>{window.history.replaceState(null,"","/");setTarget(undefined);}}/>;
  return <ProgressLibrary books={books} loadArchivesOnDemand={remote}/>;
}
