import type {Metadata} from "next";
import {siteConfig} from "./site-config";

/** Public share identity only. No provider credentials or external image host. */
export function archiveMetadata(env:Record<string,string|undefined>=process.env):Metadata{
  let base:URL;const invalid=()=>new Error("GSMUN_PUBLIC_ORIGIN must be the exact approved HTTPS origin, without a path or credentials.");
  try{base=new URL(env.GSMUN_PUBLIC_ORIGIN || "http://localhost:5203/");}catch{throw invalid();}
  if(base.username || base.password || base.pathname!=="/" || base.search || base.hash || !["https:","http:"].includes(base.protocol) || (base.protocol!=="https:" && !["localhost","127.0.0.1"].includes(base.hostname)))throw invalid();
  const images=[{url:"/identity/gsmun-2026-digital-archive.png",width:3240,height:1500,alt:siteConfig.applicationName,type:"image/png"}];
  return {metadataBase:base,title:siteConfig.title,description:siteConfig.description,applicationName:siteConfig.applicationName,category:"books",
    openGraph:{title:siteConfig.title,description:siteConfig.description,type:"website",siteName:siteConfig.applicationName,images},
    twitter:{card:"summary_large_image",title:siteConfig.title,description:siteConfig.description,images},
  };
}
