import "server-only";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join} from "node:path";
import type {AssetRow} from "./model";

let index:Promise<Map<string,string>>|undefined;
/** These approved files already ship publicly. After RLS authorization, reuse
 * byte-identical copies rather than spend Supabase egress on the 89 MB artwork.
 * Newly uploaded art is never added to this allowlist automatically. */
export async function originalArtworkPath(asset:AssetRow){
  if(asset.mime_type!=="image/webp" || !asset.checksum)return undefined;
  index ??= (async()=>{const result=new Map<string,string>();
    for(const id of ["disec","sochum","specpol","csw","icj","unsc","hsc","crisis"])for(const face of ["cover","spine","back"]){
      const path=`/books/${id}/${face}.webp`;
      try{const bytes=await readFile(join(process.cwd(),"public",path));result.set(createHash("sha256").update(bytes).digest("hex"),path);}catch{/* Missing deployment copies use the authorized storage path. */}
    }return result;
  })();
  return (await index).get(asset.checksum);
}
