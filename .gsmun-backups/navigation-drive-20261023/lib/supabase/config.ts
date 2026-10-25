export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url && !key) return null;
  if (!url || !key) throw new Error("Both Supabase environment variables are required.");
  const parsed=new URL(url);
  if(parsed.protocol!=="https:" && !["localhost","127.0.0.1"].includes(parsed.hostname))throw new Error("Supabase must use HTTPS.");
  let publicKey=key.startsWith("sb_publishable_");
  if(!publicKey && key.split(".").length===3){try{const payload=key.split(".")[1].replaceAll("-","+").replaceAll("_","/");publicKey=JSON.parse(atob(payload)).role==="anon";}catch{/* Invalid keys fail closed, never logged. */}}
  if(!publicKey)throw new Error("Use a Supabase publishable or legacy anon key, never a privileged credential.");
  return { url, key };
}
export function databaseContentEnabled() {
  if (process.env.GSMUN_CONTENT_SOURCE === "local") return false;
  return supabaseConfig() !== null;
}
