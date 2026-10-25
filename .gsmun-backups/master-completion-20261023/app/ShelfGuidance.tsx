"use client";
import {useEffect,useRef,type RefObject} from "react";
// The canvas consumes wheel/touch browsing; the page itself does not scroll.
// Observe those inputs passively, never cancel them or touch the book engine.
export function ShelfGuidance({canvas,index}:{canvas:RefObject<HTMLCanvasElement|null>;index:number}){
  const text=useRef<HTMLParagraphElement>(null);const progress=useRef(index);
  useEffect(()=>{
    progress.current=index;const node=text.current;if(node){node.style.opacity=index===0 ? "1" : "0";node.style.visibility=index===0 ? "visible" : "hidden";}
  },[index]);
  useEffect(()=>{
    const target=canvas.current;if(!target)return;let pointerY:number|null=null;
    const reduce=window.matchMedia("(prefers-reduced-motion: reduce)");
    const update=(delta:number)=>{progress.current=Math.max(0,progress.current+delta);const opacity=reduce.matches ? (progress.current===0?1:0) : Math.max(0,1-progress.current*3);if(text.current){text.current.style.opacity=String(opacity);text.current.style.visibility=opacity>0 ? "visible" : "hidden";}};
    const wheel=(event:WheelEvent)=>update(event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?target.clientHeight:1)/Math.max(180,target.clientHeight*.45));
    const start=(event:PointerEvent)=>{pointerY=event.clientY;};const move=(event:PointerEvent)=>{if(pointerY===null)return;const delta=pointerY-event.clientY;pointerY=event.clientY;update(delta/Math.max(180,target.clientHeight*.45));};const end=()=>{pointerY=null;};
    target.addEventListener("wheel",wheel,{passive:true});target.addEventListener("pointerdown",start,{passive:true});target.addEventListener("pointermove",move,{passive:true});target.addEventListener("pointerup",end);target.addEventListener("pointercancel",end);
    return()=>{target.removeEventListener("wheel",wheel);target.removeEventListener("pointerdown",start);target.removeEventListener("pointermove",move);target.removeEventListener("pointerup",end);target.removeEventListener("pointercancel",end);};
  },[canvas]);
  return <p ref={text} className="shelf-intro">Select a book to explore its photographs.</p>;
}
