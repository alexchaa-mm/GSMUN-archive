import { redirect } from "next/navigation";
import { AdminAccessError, requireAdmin } from "../../lib/supabase/server";
import AdminDashboard from "./AdminDashboard";
import styles from "./admin.module.css";
export default async function Admin() {
  let identity;
  try { identity = await requireAdmin(); }
  catch(error) {
    if(error instanceof AdminAccessError && error.status !== 403) redirect("/admin/login/");
  }
  if (!identity) return <main className={styles.root} style={{padding:32}}><h1>Administrator access required</h1><p>This account is not authorized to manage the archive.</p><a href="/admin/login/">Sign in with an administrator account</a></main>;
  return <div className={styles.root}><AdminDashboard email={identity.user.email ?? "Administrator"} /></div>;
}
