// Private offline test harness only. This file is not a Next.js route.
import { createRoot } from "react-dom/client";
import AdminDashboard from "../../app/admin/AdminDashboard";
import { LoginForm } from "../../app/admin/login/LoginForm";
import styles from "../../app/admin/admin.module.css";
createRoot(document.getElementById("root")!).render(<div className={styles.root}>
  {location.pathname.startsWith("/admin/login") ? <LoginForm configured /> : <AdminDashboard email="offline@example.invalid" />}
</div>);
