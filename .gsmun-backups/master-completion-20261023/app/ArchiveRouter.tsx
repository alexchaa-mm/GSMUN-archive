"use client";
import { useEffect,useState } from "react";
import type { PublicBook } from "./catalog";
import { ProgressLibrary } from "./ProgressLibrary";
import { PublicArchive } from "./PublicArchive";
import { ContentState } from "./ContentState";
import type {NavigationEntry,PublicNavigation} from "../lib/cms/navigation";

/** Stable public links enter the existing archive renderer, never a second shelf. */
export function ArchiveRouter({books,remote,initialBook,initialFocus,navigation}:{books:PublicBook[];remote:boolean;initialBook?:string;initialFocus?:string;navigation?:PublicNavigation}) {
  const [target,setTarget]=useState(initialBook);
  const [focus,setFocus]=useState(initialFocus);
  useEffect(()=>{const back=()=>{const query=new URLSearchParams(window.location.search);setTarget(query.get("book") ?? undefined);setFocus(query.get("focus") ?? undefined);};window.addEventListener("popstate",back);return()=>window.removeEventListener("popstate",back);},[]);
  const book=books.find(book=>book.id===target || book.slug===target);
  if (target && !book) return <ContentState><p>This volume is unavailable or no longer published.</p><button onClick={()=>{window.history.replaceState(null,"","/");setTarget(undefined);}}>Back to archive</button></ContentState>;
  if (book) return <PublicArchive book={book} remote={remote} onBackToShelf={()=>{window.history.replaceState(null,"","/");setTarget(undefined);}}/>;
  const navigate=(entry:NavigationEntry)=>{window.history.pushState(null,"",entry.href);setTarget(entry.bookId);};
  return <ProgressLibrary books={books} loadArchivesOnDemand={remote} initialFocus={focus} navigation={navigation} onNavigate={navigate}/>;
}
