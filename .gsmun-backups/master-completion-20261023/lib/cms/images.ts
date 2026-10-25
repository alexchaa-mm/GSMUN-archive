import sharp from "sharp";
import { createHash } from "node:crypto";
import { validateUpload } from "./model";

export async function processImage(bytes:Buffer,mime:string,artwork=false) {
  validateUpload(mime,bytes.length);
  const image=sharp(bytes,{limitInputPixels:50_000_000,failOn:"error"});
  const metadata=await image.metadata();
  const format=metadata.format;
  const expected=format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : format === "webp" ? "image/webp" : "";
  if(expected !== mime || !metadata.width || !metadata.height || (metadata.pages ?? 1)>1) throw new Error("The file is not a valid single-frame JPEG, PNG or WebP image.");
  if(metadata.width<32 || metadata.height<32 || metadata.width>16000 || metadata.height>16000) throw new Error("Image dimensions must be between 32 and 16000 pixels per side.");
  const swapped=!artwork && metadata.orientation && metadata.orientation >= 5;
  const width=swapped ? metadata.height : metadata.width;
  const height=swapped ? metadata.width : metadata.height;
  const variants:{name:string;bytes:Buffer;mime:string;width:number;height:number}[]=[];
  if(!artwork) for(const [name,size,quality] of [["thumbnail",760,80],["viewer",2400,88]] as const) {
    const processed=await sharp(bytes,{limitInputPixels:50_000_000}).rotate().resize({width:size,height:size,fit:"inside",withoutEnlargement:true}).webp({quality}).toBuffer({resolveWithObject:true});
    variants.push({name,bytes:processed.data,mime:"image/webp",width:processed.info.width,height:processed.info.height});
  }
  return {width,height,mime,extension:format === "jpeg" ? "jpg" : format!,checksum:createHash("sha256").update(bytes).digest("hex"),variants};
}
