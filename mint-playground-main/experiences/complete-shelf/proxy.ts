import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "./lib/supabase/config";
import {archiveDatabaseFetch} from "./lib/supabase/request";

export async function proxy(request: NextRequest) {
  const config = supabaseConfig();
  let response = NextResponse.next({request});
  if (!config) return response;
  const db = createServerClient(config.url,config.key,{
    global:{fetch:archiveDatabaseFetch},
    cookieOptions:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV === "production",path:"/"},
    cookies:{
      getAll:() => request.cookies.getAll(),
      setAll:values => {
        values.forEach(({name,value}) => request.cookies.set(name,value));
        const previousCookies = response.cookies.getAll();
        response = NextResponse.next({request});
        previousCookies.forEach(cookie => response.cookies.set(cookie));
        values.forEach(({name,value,options}) => response.cookies.set(name,value,options));
      },
    },
  });
  try { await db.auth.getClaims(); } catch { /* Protected routes independently verify users and membership, and fail closed. */ }
  response.headers.set("Cache-Control","private, no-store");
  return response;
}
export const config = {matcher:["/admin/:path*","/api/admin/:path*","/api/auth/:path*","/api/assets/:path*"]};
