"use client";
import {useEffect,useRef} from "react";
import type {NavigationEntry,PublicNavigation} from "../lib/cms/navigation";

export function NavigationDrawer({navigation,onActivate}:{navigation:PublicNavigation;onActivate?:(entry:NavigationEntry)=>void}){
  const dialog=useRef<HTMLDialogElement>(null);const trigger=useRef<HTMLButtonElement>(null);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  function close(entry?:NavigationEntry){
    const panel=dialog.current;if(!panel || !panel.open)return;
    if(timer.current)clearTimeout(timer.current);panel.classList.add("is-closing");
    const finish=()=>{panel.close();panel.classList.remove("is-closing");trigger.current?.setAttribute("aria-expanded","false");trigger.current?.focus({preventScroll:true});if(entry){if(onActivate)onActivate(entry);else window.location.assign(entry.href);}};
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)finish();else timer.current=setTimeout(finish,220);
  }
  return <><button ref={trigger} className="archive-menu-trigger" type="button" aria-label="Open archive navigation" aria-haspopup="dialog" aria-expanded="false" onClick={()=>{dialog.current?.showModal();trigger.current?.setAttribute("aria-expanded","true");}}><span/><span/><span/></button>
    <dialog ref={dialog} className="archive-drawer" aria-label="Archive navigation" onCancel={event=>{event.preventDefault();close();}} onClick={event=>{const rect=dialog.current!.getBoundingClientRect();if(event.target===event.currentTarget && (event.clientX<rect.left || event.clientY<rect.top || event.clientX>rect.right || event.clientY>rect.bottom))close();}}>
      <div className="archive-drawer__heading"><h2>Explore archive</h2><button type="button" aria-label="Close navigation" onClick={()=>close()}>×</button></div>
      <nav aria-label="Published collections">{navigation.groups.map(group=><section key={group.id}><h3>{group.title}</h3><ul>{group.entries.map(entry=><li key={entry.id}><a href={entry.href} onClick={event=>{if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;event.preventDefault();close(entry);}}>{entry.label}</a></li>)}</ul></section>)}</nav>
      {!navigation.groups.length && <p>No published destinations are available yet.</p>}
    </dialog></>;
}
