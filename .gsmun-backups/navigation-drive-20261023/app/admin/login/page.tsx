import { supabaseConfig } from "../../../lib/supabase/config";
import { LoginForm } from "./LoginForm";
import styles from "../admin.module.css";
export default function AdminLogin() { return <div className={styles.root}><LoginForm configured={!!supabaseConfig()} /></div>; }
