"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import styles from "../admin.module.css";
export function LoginForm({configured}:{configured:boolean}) {
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const submitting = useRef(false);
  return <main className={`${styles.panel} ${styles.login}`}>
    <h1>GSMUN archive admin</h1>
    <p className={styles.hint}>Private content management. Public visitors do not need an account.</p>
    {!configured ? <div className={styles.notice}>Supabase is not configured yet. Follow <code>docs/SUPABASE-SETUP.md</code> and add the two project environment variables to <code>.env.local</code>.</div> : null}
    {error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null}
    <form onSubmit={async event=>{
      event.preventDefault(); if (submitting.current) return;
      submitting.current = true; setBusy(true);setError("");
      const values=new FormData(event.currentTarget);
      try {
        const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:values.get("email"),password:values.get("password")})});
        const result=await response.json();if(!response.ok) throw new Error(result.error);
        window.location.assign("/admin/");
      } catch(error) {setError(error instanceof Error ? error.message : "Login failed. Please try again.");setBusy(false);submitting.current=false;}
    }}>
      <label className={styles.field}>Email<input name="email" type="email" autoComplete="username" required disabled={!configured || busy} /></label>
      <label className={styles.field}>Password<input name="password" type="password" autoComplete="current-password" required disabled={!configured || busy} /></label>
      <button className={styles.primary} type="submit" disabled={!configured || busy}>{busy ? "Signing in…" : "Log in"}</button>
    </form>
    <p className={styles.hint}>Accounts are created privately by the archive administrator. There is no public registration.</p>
    <Link href="/">← Public archive</Link>
  </main>;
}
