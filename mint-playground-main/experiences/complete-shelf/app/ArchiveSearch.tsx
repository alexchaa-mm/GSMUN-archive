"use client";
import {useEffect,useRef,useState} from "react";
import type {PublicBook} from "./catalog";
import type {GalleryPage} from "../lib/cms/gallery-page";
import type {SearchPhoto} from "../lib/cms/public-search";
import {PhotoViewer} from "./PhotoViewer";
import Link from "next/link";

export function ArchiveSearch({books}:{books:PublicBook[]}){
  const [text,setText]=useState("");const [query,setQuery]=useState("");const [book,setBook]=useState("");const [sort,setSort]=useState("newest");
  const [page,setPage]=useState<Omit<GalleryPage,"photos"> & {photos:SearchPhoto[]}>({photos:[],count:0,offset:0,hasMore:false});
  const [error,setError]=useState("");const [busy,setBusy]=useState(true);const [retry,setRetry]=useState(0);
  const [index,setIndex]=useState<number|null>(null);const [trigger,setTrigger]=useState<HTMLElement|null>(null);
  const revision=useRef(0);
  function reset(){revision.current++;setBusy(true);setError("");setPage({photos:[],count:0,offset:0,hasMore:false});}
  useEffect(()=>{const controller=new AbortController();
    fetch(`/api/content/search?${new URLSearchParams({search:query,book,sort})}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error("Search unavailable. Please retry.");return response.json();}).then(result=>{if(!controller.signal.aborted)setPage(result);}).catch(error=>{if(!controller.signal.aborted)setError(error.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[query,book,sort,retry]);
  async function more(){const version=revision.current;setBusy(true);setError("");try{const response=await fetch(`/api/content/search?${new URLSearchParams({search:query,book,sort,offset:String(page.offset+48)})}`,{cache:"no-store"});if(!response.ok)throw new Error("More photographs could not be loaded.");const next=await response.json();if(version===revision.current)setPage(previous=>({...next,photos:[...previous.photos,...next.photos]}));}catch(error){if(version===revision.current)setError(error instanceof Error ? error.message : "Search unavailable.");}finally{if(version===revision.current)setBusy(false);}}
  return <div className="committee-archive" tabIndex={-1}><div className="archive-volume" inert={index!==null ? true : undefined}>
    <div className="archive-masthead"><Link href="/" className="archive-text-button archive-masthead__back">← Back to archive</Link><div className="archive-masthead__identity"><img src="/archive/gsmun-archive-identity.png" alt="GSMUN 2026 Digital Archive" width="3240" height="1500"/></div></div>
    <header className="archive-hero"><div className="archive-hero__title"><h1>Find photographs</h1><p>GSMUN 2026 · All published volumes</p></div></header>
    <main className="archive-contents"><form className="gallery-tools" onSubmit={event=>{event.preventDefault();reset();setQuery(text.trim());setRetry(value=>value+1);}}>
      <label>Search the archive<input type="search" value={text} maxLength={120} onChange={event=>setText(event.target.value)} placeholder="Caption, credit, committee or chapter"/></label>
      <label>Volume<select value={book} onChange={event=>{reset();setBook(event.target.value);}}><option value="">All volumes</option>{books.map(book=><option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
      <label>Order<select value={sort} onChange={event=>{reset();setSort(event.target.value);}}><option value="newest">Newest added</option><option value="oldest">Oldest added</option><option value="order">Archive order</option></select></label><button>Search</button>
    </form><section className="archive-section"><p className="archive-empty" role="status">{busy ? "Loading photographs…" : `${page.count} photographs`}</p>{error && <p role="alert">{error} <button onClick={()=>setRetry(value=>value+1)}>Retry</button></p>}
      <div className="archive-photo-grid">{page.photos.map((photo,index)=><button className="archive-photo" key={photo.id} onClick={event=>{setTrigger(event.currentTarget);setIndex(index);}} aria-label={`Open ${photo.alt || "photograph"} · ${photo.bookTitle} · ${photo.sectionTitle}`}><img src={photo.thumbnail} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" onError={event=>{event.currentTarget.alt="Photograph unavailable";}}/></button>)}</div>
      {page.hasMore && <button className="archive-text-button gallery-more" disabled={busy} onClick={()=>void more()}>Load more photographs</button>}
    </section></main></div>{index!==null && page.photos[index] && <PhotoViewer photos={page.photos} index={index} returnFocus={trigger} onSelect={setIndex} onClose={()=>setIndex(null)}/>}</div>;
}
