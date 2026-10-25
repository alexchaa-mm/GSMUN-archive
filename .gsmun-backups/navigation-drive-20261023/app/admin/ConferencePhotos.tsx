"use client";
import {useEffect,useState} from "react";
import type {BookRow,ArchiveRow,SectionRow} from "../../lib/cms/model";
import {listContent} from "./admin-client";
import {useCollection,CollectionState,type RunAction} from "./AdminDashboard";
import {PhotoManager} from "./PhotoManager";
import styles from "./admin.module.css";

// Only the small book/chapter selectors are loaded completely. Photographs keep
// their existing bounded, searchable 48-record pages and lazy thumbnails.
function useChoices<T>(entity:string,parent?:string,enabled=true){
  const [retry,setRetry]=useState(0);const key=JSON.stringify([entity,parent,enabled,retry]);
  const [result,setResult]=useState<{key:string;items:T[];error:string}>({key:"",items:[],error:""});
  useEffect(()=>{
    const controller=new AbortController();
    if(enabled)void(async()=>{
      const values:T[]=[];
      for(let offset=0;;offset+=100){const page=await listContent<T>(entity,parent,offset,{limit:100},controller.signal);values.push(...page.data);if(page.data.length<100)break;}
      if(!controller.signal.aborted)setResult({key,items:values,error:""});
    })().catch(error=>{if(!controller.signal.aborted)setResult({key,items:[],error:error instanceof Error ? error.message : "Could not load choices."});});
    return()=>controller.abort();
  },[entity,parent,enabled,key]);
  return {items:enabled && result.key===key ? result.items : [],loading:enabled && result.key!==key,error:result.key===key ? result.error : "",retry:()=>setRetry(value=>value+1)};
}
export function ConferencePhotos({run}:{run:RunAction}){
  const books=useChoices<BookRow>("books");const [bookId,setBookId]=useState("");const [pending,setPending]=useState(false);
  const book=books.items.find(book=>book.id===bookId);
  const canLeave=()=>!pending || window.confirm("Pause uploads before changing destination? Saved files stay saved. Reselect the same originals in the original chapter to retry unfinished files with their saved IDs.");
  return <><h1>Conference photographs</h1><p>Choose the book and chapter first. This area manages conference photos only; covers, spines and backs are under Artwork / assets.</p>
    <div className={styles.panel}><label className={styles.field}>Select book<select aria-label="Select book" value={bookId} disabled={books.loading} onChange={event=>{if(event.target.value===bookId || !canLeave())return;setPending(false);setBookId(event.target.value);}}><option value="">Choose a book…</option>{books.items.map(book=><option key={book.id} value={book.id}>{book.title} · {book.committee_name} · {book.status}</option>)}</select></label>
      {books.loading && <p role="status">Loading books…</p>}{books.error && <p role="alert">{books.error} <button onClick={books.retry}>Retry books</button></p>}
      {!books.loading && !books.error && !books.items.length && <p>No books exist in this content store yet. Create a draft under Books, or complete the separately approved catalogue import.</p>}
    </div>
    {book ? <ChapterPhotos key={book.id} book={book} run={run} canLeave={canLeave} onPendingChange={setPending}/> : <p>Select a book to choose its chapters and upload photographs.</p>}
  </>;
}
function ChapterPhotos({book,run,canLeave,onPendingChange}:{book:BookRow;run:RunAction;canLeave:()=>boolean;onPendingChange:(value:boolean)=>void}){
  const archives=useCollection<ArchiveRow>("archives",book.id);const archive=archives.items[0];
  const chapters=useChoices<SectionRow>("sections",archive?.id,!!archive);
  const [chapterId,setChapterId]=useState("");const section=chapters.items.find(chapter=>chapter.id===chapterId);
  return <><CollectionState collection={archives}/><div className={styles.panel}>
    <h2>{book.title}</h2><p>{book.committee_name}</p>
    <label className={styles.field}>Select chapter<select aria-label="Select chapter" value={chapterId} disabled={!archive || chapters.loading} onChange={event=>{if(event.target.value===chapterId || !canLeave())return;onPendingChange(false);setChapterId(event.target.value);}}><option value="">Choose a chapter…</option>{chapters.items.map(section=><option key={section.id} value={section.id}>{section.title} · {section.status}</option>)}</select></label>
    {chapters.loading && <p role="status">Loading chapters…</p>}{chapters.error && <p role="alert">{chapters.error} <button onClick={chapters.retry}>Retry chapters</button></p>}
    {archive && !chapters.loading && !chapters.error && !chapters.items.length && <p>This book has no chapters. Add a chapter under Books → Edit / sections / photos.</p>}
    {!archives.loading && !archives.error && !archive && <p role="alert">This book has no archive relationship. Review its saved content before uploading.</p>}
  </div>{section ? <PhotoManager key={section.id} book={book} section={section} run={run} onPendingChange={onPendingChange}/> : <p>Select the destination chapter before choosing files. Nothing is uploaded until a chapter is selected.</p>}</>;
}
