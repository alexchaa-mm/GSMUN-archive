"use client";
import {useEffect,useId,useRef,useState} from "react";
import {adminRequest} from "./admin-client";
import styles from "./admin.module.css";

export function SlugField({label,value,onChange,entity,parent,exclude}:{label:string;value:string;onChange:(value:string)=>void;entity:"books"|"sections";parent?:string;exclude?:string}){
  const id=useId();const input=useRef<HTMLInputElement>(null);
  const key=JSON.stringify([entity,parent,exclude,value]);
  const [checked,setChecked]=useState({key:"",status:""});const status=checked.key===key ? checked.status : "";
  useEffect(()=>{
    const controller=new AbortController();
    if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value))return()=>controller.abort();
    const timer=setTimeout(()=>{
      setChecked({key,status:"Checking URL…"});const params=new URLSearchParams({checkSlug:entity,slug:value});
      if(parent)params.set("parent",parent);if(exclude)params.set("exclude",exclude);
      void adminRequest<{available:boolean}>(`/api/admin/content?${params}`,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setChecked({key,status:result.available ? "URL available." : entity==="books" ? "This book URL is already used. Choose another slug." : "This chapter URL is already used in this book. Choose another slug."});}).catch(()=>{if(!controller.signal.aborted)setChecked({key,status:"Could not check now. The server will validate again when you save."});});
    },250);
    return()=>{controller.abort();clearTimeout(timer);};
  },[entity,parent,exclude,value,key]);
  const taken=status.includes("already used");
  useEffect(()=>{input.current?.setCustomValidity(taken ? status : "");},[taken,status]);
  return <div><label className={styles.field}>{label}<input ref={input} required maxLength={160} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={value} aria-describedby={id} aria-invalid={taken || undefined} onChange={event=>onChange(event.target.value)} /></label><small id={id} className={styles.hint} role="status">{status || "Suggested from the name for new content; editable if needed."}</small></div>;
}
