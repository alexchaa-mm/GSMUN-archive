export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url && !key) return null;
  if (!url || !key) throw new Error("Both Supabase environment variables are required.");
  return { url, key };
}
export function databaseContentEnabled() {
  if (process.env.GSMUN_CONTENT_SOURCE === "local") return false;
  return supabaseConfig() !== null;
}
