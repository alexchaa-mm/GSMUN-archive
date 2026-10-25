import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

export function publicDatabase() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  // No admin cookies and no privileged key: public reads always exercise anonymous RLS.
  return createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, {...init, cache:"no-store"}) } });
}
export async function sessionDatabase() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", path:"/" },
    cookies: {
      getAll: () => store.getAll(),
      setAll: values => { try { values.forEach(({name,value,options}) => store.set(name,value,options)); } catch { /* Proxy persists refreshed cookies during server rendering. */ } },
    },
  });
}
export class AdminAccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function requireAdmin() {
  if (!supabaseConfig()) throw new AdminAccessError(503,"Supabase setup is required before using admin.");
  const db = await sessionDatabase();
  const {data:{user},error} = await db.auth.getUser();
  if (error && (error.status === 0 || (error.status ?? 0) >= 500)) throw new AdminAccessError(503,"Authentication is temporarily unavailable. Your edits have been kept; try again shortly.");
  if (error || !user) throw new AdminAccessError(401,"Your session has expired. Please log in again.");
  const membership = await db.rpc("is_archive_admin");
  if (membership.error) throw new AdminAccessError(503,"Administrator membership could not be verified. Please retry.");
  if (membership.data !== true) throw new AdminAccessError(403,"This account does not have archive administrator access.");
  return {db,user};
}
