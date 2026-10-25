"use client";
import {useEffect,useState} from "react";
import {adminRequest} from "./admin-client";
import {navigationSchema,buildNavigation,destinationAvailable,type NavigationConfig,type NavigationBook} from "../../lib/cms/navigation";
import {NavigationDrawer} from "../NavigationDrawer";
import type {RunAction} from "./AdminDashboard";
import styles from "./admin.module.css";
type State={config:NavigationConfig;draftVersion:number;publishedVersion:number;books:NavigationBook[]};
function move<T extends {order:number}>(items:T[],index:number,direction:number){const next=[...items];const target=index+direction;if(target<0 || target>=next.length)return items;[next[index],next[target]]=[next[target],next[index]];return next.map((item,i)=>({...item,order:(i+1)*10}));}
export function NavigationEditor({run}:{run:RunAction}){
  const [state,setState]=useState<State|null>(null);const [error,setError]=useState("");const [previewNotice,setPreviewNotice]=useState("");
  useEffect(()=>{const abort=new AbortController();void adminRequest<State>("/api/admin/navigation",{signal:abort.signal}).then(value=>{if(!abort.signal.aborted)setState(value);}).catch(error=>{if(!abort.signal.aborted)setError(error.message);});return()=>abort.abort();},[]);
  if(error)return <div role="alert" className={styles.notice}>{error} <button onClick={()=>void run(async()=>{setState(await adminRequest<State>("/api/admin/navigation"));setError("");})}>Reload navigation</button></div>;
  if(!state)return <p role="status">Loading navigation settings…</p>;
  const {config,books}=state;const published=books.filter(book=>destinationAvailable({bookId:book.id},books));
  const update=(config:NavigationConfig)=>setState(current=>current ? {...current,config} : current);
  const groupChange=(index:number,values:Partial<NavigationConfig["groups"][number]>)=>update({...config,groups:config.groups.map((group,i)=>i===index ? {...group,...values} : group)});
  async function save(action:"draft"|"publish"){
    if(!state)return;
    if(action==="publish" && !window.confirm("Publish navigation labels and destinations only? This does not publish any books, chapters or photographs."))return false;
    const parsed=navigationSchema.parse(config);
    const result=await adminRequest<{version:number}>("/api/admin/navigation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,config:parsed,version:action==="draft" ? state.draftVersion : state.publishedVersion})});
    setState(current=>current ? {...current,[action==="draft"?"draftVersion":"publishedVersion"]:result.version} : current);
  }
  return <><h1>Public Navigation</h1><p>Labels and destinations only. This never changes content, artwork or publication statuses. Unavailable destinations are excluded from public navigation.</p>
    <div className={styles.panel}><label className={styles.selection}><input type="checkbox" checked={config.autoInclude} onChange={event=>update({...config,autoInclude:event.target.checked})}/>Automatically include unlisted published books</label><p className={styles.hint}>Automatic books use the Committees, Ceremonies & Events or Archive group. A manually hidden entry also suppresses its automatic book entry. New ceremonies use ordinary books/chapters, not duplicate content.</p>
      <div className={styles.actions}><button onClick={()=>void run(()=>save("draft"))}>Save navigation draft</button><button onClick={()=>void run(()=>save("publish"))}>Publish navigation</button><NavigationDrawer navigation={buildNavigation(config,books)} onActivate={entry=>setPreviewNotice(`Preview only: ${entry.behavior==="focus" ? "focus" : "open"} ${entry.label} (${entry.href}). No navigation or publication performed.`)}/><span>Use the menu icon to preview this unsaved draft.</span></div>{previewNotice && <p role="status">{previewNotice}</p>}
    </div>
    {config.groups.map((group,index)=><section className={styles.panel} key={group.id} data-testid="navigation-group">
      <div className={styles.fields}><label>Group label<input value={group.title} maxLength={100} onChange={event=>groupChange(index,{title:event.target.value})}/></label><label className={styles.selection}><input type="checkbox" checked={group.visible} onChange={event=>groupChange(index,{visible:event.target.checked})}/>Show group</label></div>
      <div className={styles.actions}><button aria-label={`Move ${group.title} group earlier`} disabled={!index} onClick={()=>update({...config,groups:move(config.groups,index,-1)})}>↑</button><button aria-label={`Move ${group.title} group later`} disabled={index===config.groups.length-1} onClick={()=>update({...config,groups:move(config.groups,index,1)})}>↓</button><button onClick={()=>{if(window.confirm("Remove this navigation group and its entries? Underlying content is untouched."))update({...config,groups:config.groups.filter((_,i)=>i!==index)});}}>Remove group</button></div>
      {group.entries.map((entry,entryIndex)=>{
        const book=books.find(book=>book.id===entry.bookId);
        const change=(values:Partial<typeof entry>)=>groupChange(index,{entries:group.entries.map((item,i)=>i===entryIndex ? {...item,...values} : item)});
        return <div className={styles.row} key={entry.id} data-testid="navigation-entry"><div className={styles.fields}>
          <label>Visitor-facing label<input value={entry.label} maxLength={200} onChange={event=>change({label:event.target.value})}/></label>
          <label>Destination book<select aria-label="Navigation destination book" value={entry.bookId} onChange={event=>change({bookId:event.target.value,chapterId:undefined})}>{!published.some(book=>book.id===entry.bookId) && <option value={entry.bookId}>Unavailable stored destination</option>}{published.map(book=><option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
          <label>Chapter (optional)<select aria-label="Navigation destination chapter" value={entry.chapterId ?? ""} onChange={event=>change({chapterId:event.target.value || undefined,...(event.target.value?{behavior:"open"}: {})})}><option value="">Whole book</option>{entry.chapterId && !book?.sections.some(section=>section.id===entry.chapterId && section.status==="published") && <option value={entry.chapterId}>Unavailable stored chapter</option>}{book?.sections.filter(section=>section.status==="published" || section.status===undefined).map(section=><option key={section.id} value={section.id}>{section.title}</option>)}</select></label>
          <label>Destination behaviour<select aria-label="Navigation destination behaviour" value={entry.chapterId ? "open" : entry.behavior} disabled={!!entry.chapterId} onChange={event=>change({behavior:event.target.value as "focus"|"open"})}><option value="focus">Focus book on bookshelf</option><option value="open">Open directly</option></select></label>
        </div><div className={styles.actions}><label className={styles.selection}><input type="checkbox" checked={entry.visible} onChange={event=>change({visible:event.target.checked})}/>Show entry</label><button aria-label={`Move ${entry.label} earlier`} disabled={!entryIndex} onClick={()=>groupChange(index,{entries:move(group.entries,entryIndex,-1)})}>↑</button><button aria-label={`Move ${entry.label} later`} disabled={entryIndex===group.entries.length-1} onClick={()=>groupChange(index,{entries:move(group.entries,entryIndex,1)})}>↓</button><button onClick={()=>groupChange(index,{entries:group.entries.filter((_,i)=>i!==entryIndex)})}>Remove entry</button></div>{!destinationAvailable(entry,books) && <p role="alert">Destination missing or unpublished. Hidden from public navigation; fix or hide this entry before publishing settings.</p>}</div>;
      })}
      <button disabled={!published.length} onClick={()=>groupChange(index,{entries:[...group.entries,{id:crypto.randomUUID(),label:published[0].shortTitle || published[0].title,visible:true,order:(group.entries.length+1)*10,bookId:published[0].id,behavior:"focus"}]})}>Add entry</button>{!published.length && <p className={styles.hint}>Publish an intended book explicitly before adding it as a public destination.</p>}
    </section>)}
    <button onClick={()=>update({...config,groups:[...config.groups,{id:crypto.randomUUID(),title:"New collection",visible:true,order:(config.groups.length+1)*10,entries:[]}]})}>Add navigation group</button>
  </>;
}
