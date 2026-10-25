/** Human names become editable URL suggestions. Existing records never call
 * this automatically when renamed, so published links remain stable. */
export function suggestSlug(name: string) {
  return name.normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/ß/g,"ss").replace(/[æÆ]/g,"ae").replace(/[øØ]/g,"o")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")
    .slice(0,160).replace(/-+$/g,"");
}
