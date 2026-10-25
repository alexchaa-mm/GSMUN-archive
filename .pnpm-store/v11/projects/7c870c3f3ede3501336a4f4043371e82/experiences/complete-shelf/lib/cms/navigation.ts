import {z} from "zod";
const id=z.string().regex(/^[a-zA-Z0-9_-]+$/).max(160);
export const navigationSchema=z.object({
  autoInclude:z.boolean(),
  groups:z.array(z.object({id,title:z.string().trim().min(1).max(100),visible:z.boolean(),order:z.number().int().min(0).max(10000),entries:z.array(z.object({id,label:z.string().trim().min(1).max(200),visible:z.boolean(),order:z.number().int().min(0).max(10000),bookId:id,chapterId:id.optional(),behavior:z.enum(["focus","open"])})).max(200)})).max(30),
}).superRefine((value,ctx)=>{const keys=value.groups.flatMap(group=>[group.id,...group.entries.map(entry=>entry.id)]);if(new Set(keys).size!==keys.length)ctx.addIssue({code:"custom",message:"Group and entry IDs must be unique."});});
export type NavigationConfig=z.infer<typeof navigationSchema>;
export type NavigationBook={id:string;slug:string;title:string;shortTitle:string;committeeName:string;status:string;archiveStatus?:string;sections:{id:string;contentId?:string;title:string;status?:string}[]};
export type NavigationEntry={id:string;label:string;bookId:string;chapterId?:string;behavior:"focus"|"open";href:string};
export type PublicNavigation={groups:{id:string;title:string;entries:NavigationEntry[]}[]};
export const defaultNavigation=():NavigationConfig=>({autoInclude:true,groups:[{id:"committees",title:"Committees",visible:true,order:10,entries:[]},{id:"events",title:"Ceremonies & Events",visible:true,order:20,entries:[]},{id:"archive",title:"Archive",visible:true,order:30,entries:[]}]});
const committees=new Set(["disec","sochum","specpol","csw","icj","unsc","hsc","crisis"]);
export function destinationAvailable(entry:{bookId:string;chapterId?:string},books:NavigationBook[]){
  const book=books.find(book=>book.id===entry.bookId);
  return !!book && book.status==="published" && (!book.archiveStatus || book.archiveStatus==="published") && (!entry.chapterId || book.sections.some(section=>(section.id===entry.chapterId || section.contentId===entry.chapterId) && (!section.status || section.status==="published")));
}
export function navigationHref(entry:{bookId:string;chapterId?:string;behavior:"focus"|"open"}){
  return "/?"+new URLSearchParams(entry.chapterId ? {book:entry.bookId,chapter:entry.chapterId} : entry.behavior==="focus" ? {focus:entry.bookId} : {book:entry.bookId});
}
export function buildNavigation(config:NavigationConfig,books:NavigationBook[]):PublicNavigation{
  const groups:PublicNavigation["groups"]=[...config.groups].sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id)).filter(group=>group.visible).map(group=>({id:group.id,title:group.title,entries:[...group.entries].sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id)).filter(entry=>entry.visible && destinationAvailable(entry,books)).map(entry=>({...entry,behavior:entry.chapterId ? "open" as const : entry.behavior,href:navigationHref(entry)}))}));
  // Hidden/manual destinations suppress automatic entries, including in hidden groups.
  const assigned=new Set(config.groups.flatMap(group=>group.entries.map(entry=>entry.bookId)));
  if(config.autoInclude)for(const book of books){
    if(assigned.has(book.id) || !destinationAvailable({bookId:book.id},books))continue;
    const preferred=committees.has(book.id) ? "committees" : /ceremony|opening|closing/i.test(book.title) ? "events" : "archive";
    const group=groups.find(group=>group.id===preferred) ?? groups.find(group=>group.id==="archive");if(!group)continue;
    const label=book.id==="crisis" ? `${book.title}, ${book.committeeName}` : book.shortTitle || book.title;
    group.entries.push({id:`auto-${book.id}`,label,bookId:book.id,behavior:"focus",href:navigationHref({bookId:book.id,behavior:"focus"})});
  }
  return {groups:groups.filter(group=>group.entries.length)};
}
/** Only visible, valid destinations are ever placed in the publicly readable row. */
export function publishedNavigationConfig(config:NavigationConfig,books:NavigationBook[]):NavigationConfig{
  return {...config,groups:config.groups.map(group=>({...group,title:group.visible ? group.title : "Hidden group",entries:group.entries.map(entry=>group.visible && entry.visible && destinationAvailable(entry,books) ? entry : {...entry,label:"Hidden destination",visible:false})}))};
}
