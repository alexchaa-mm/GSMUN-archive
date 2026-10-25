// Loopback-only simulated release environment. Never imported by a Next route.
import {createRoot} from "react-dom/client";
import {useEffect,useState} from "react";
import {ArchiveRouter} from "../../app/ArchiveRouter";
import type {PublicNavigation} from "../../lib/cms/navigation";
import {ProgressLibrary} from "../../app/ProgressLibrary";
import AdminDashboard from "../../app/admin/AdminDashboard";
import type {PublicBook} from "../../app/catalog";
import styles from "../../app/admin/admin.module.css";
import Link from "next/link";

function Sandbox(){
  const [books,setBooks]=useState<PublicBook[]|null>(null);const [preview,setPreview]=useState<PublicBook|null>(null);const [error,setError]=useState("");
  const [navigation,setNavigation]=useState<PublicNavigation|undefined>();
  const login=location.pathname.startsWith("/admin/login");const admin=location.pathname==="/admin/";const privatePreview=location.pathname.startsWith("/admin/preview/");const shelfPreview=location.pathname.startsWith("/admin/shelf/");
  useEffect(()=>{if(login || admin)return;const url=privatePreview ? `/api/sandbox/preview?id=${encodeURIComponent(location.pathname.split("/")[3])}` : shelfPreview ? "/api/sandbox/preview-books" : "/api/sandbox/books";
    fetch(url,{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error("Local preview is unavailable. Open the simulated admin first.");return response.json();}).then(data=>privatePreview ? setPreview(data) : setBooks(data)).catch(error=>setError(error.message));
    if(!privatePreview && !shelfPreview)void fetch("/api/sandbox/navigation").then(response=>response.json()).then(setNavigation).catch(()=>{});
  },[login,admin,privatePreview,shelfPreview]);
  const banner=<aside className="sandbox-notice">LOCAL SIMULATION · Not Supabase or real authentication · <a href="http://127.0.0.1:5211/" target="_blank" rel="noreferrer">Public design preview</a> · <Link href="/admin/shelf/">Private shelf preview</Link> · <Link href="/admin/">Admin</Link></aside>;
  if(login)return <>{banner}<div className={styles.root} style={{top:34,padding:32}}><h1>Local release sandbox</h1><p>This is an isolated test store. Do not enter your real administrator password. No production service is contacted.</p><button onClick={()=>void fetch("/api/sandbox/session",{method:"POST"}).then(response=>{if(!response.ok)throw new Error();location.href="/admin/";}).catch(()=>setError("Local session could not be started."))}>Enter simulated administrator</button>{error && <p role="alert">{error}</p>}</div></>;
  if(admin)return <>{banner}<div className={styles.root} style={{top:34}}><AdminDashboard email="LOCAL SIMULATION — no real account"/></div></>;
  return <>{banner}{error ? <div className="sandbox-empty" role="alert">{error}</div> : privatePreview ? preview ? <ProgressLibrary books={[preview]}/> : <div className="sandbox-empty">Opening private local preview…</div> : books ? books.length ? shelfPreview ? <ProgressLibrary books={books}/> : <ArchiveRouter books={books} remote navigation={navigation} initialFocus={new URLSearchParams(location.search).get("focus") ?? undefined} initialBook={new URLSearchParams(location.search).get("book") ?? undefined}/> : <div className="sandbox-empty"><h1>No local volumes are published.</h1><p>The eight original volumes are preserved as drafts in this simulated store. Open the local admin to preview or explicitly publish a test volume.</p><a href="/admin/">Open simulated admin</a></div> : <div className="sandbox-empty">Opening local archive…</div>}</>;
}
createRoot(document.getElementById("root")!).render(<Sandbox/>);
